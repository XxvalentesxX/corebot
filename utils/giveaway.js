// utils/giveaway.js
const fs   = require("fs");
const path = require("path");

const GW_PATH = path.join(process.cwd(), "data", "giveaways.json");

function load() {
  if (!fs.existsSync(GW_PATH)) {
    const defaults = { giveaways: {}, authorized: [] };
    fs.mkdirSync(path.dirname(GW_PATH), { recursive: true });
    fs.writeFileSync(GW_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(GW_PATH, "utf-8"));
}

function save(data) {
  fs.writeFileSync(GW_PATH, JSON.stringify(data, null, 2));
}

// ── Giveaways ──────────────────────────────────────────────────────────────
function getGiveaway(messageId)  { return load().giveaways[messageId] ?? null; }
function getAllGiveaways()        { return Object.values(load().giveaways); }
function getActiveGiveaways()    { return getAllGiveaways().filter((g) => g.status === "active"); }

function createGiveaway(data) {
  const db = load();
  db.giveaways[data.id] = { ...data, entries: [], thankEntries: [], status: "active", winners: [] };
  save(db);
  return db.giveaways[data.id];
}

function updateGiveaway(messageId, updates) {
  const db = load();
  if (!db.giveaways[messageId]) return null;
  Object.assign(db.giveaways[messageId], updates);
  save(db);
  return db.giveaways[messageId];
}

function addEntry(messageId, userId) {
  const db = load();
  const gw = db.giveaways[messageId];
  if (!gw || gw.entries.includes(userId)) return false;
  gw.entries.push(userId);
  save(db);
  return true;
}

function removeEntry(messageId, userId) {
  const db = load();
  const gw = db.giveaways[messageId];
  if (!gw) return false;
  gw.entries = gw.entries.filter((id) => id !== userId);
  save(db);
  return true;
}

function addThankEntry(messageId, userId) {
  const db = load();
  const gw = db.giveaways[messageId];
  if (!gw || gw.thankEntries.includes(userId)) return false;
  gw.thankEntries.push(userId);
  save(db);
  return true;
}

// ── Authorized ─────────────────────────────────────────────────────────────
function getAuthorized()      { return load().authorized; }
function addAuthorized(id)    { const db = load(); if (!db.authorized.includes(id)) { db.authorized.push(id); save(db); } }
function removeAuthorized(id) { const db = load(); db.authorized = db.authorized.filter((x) => x !== id); save(db); }

// ── Elegir ganadores ────────────────────────────────────────────────────────
async function pickWinnersWithRoles(gw, count, guild) {
  let pool = [...gw.entries];

  // Filtro: agradecer al hosteador
  if (gw.requirements?.thankHost) {
    pool = pool.filter((id) => gw.thankEntries.includes(id));
  }

  // Filtros que requieren fetchear el member
  const needsMemberFetch = gw.requirements?.roles?.length || gw.requirements?.serverAgeMs;

  if (needsMemberFetch) {
    const filtered = [];
    for (const userId of pool) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      // Filtro: roles
      if (gw.requirements?.roles?.length) {
        const hasRole = gw.requirements.roles.some((r) => member.roles.cache.has(r));
        if (!hasRole) continue;
      }

      // Filtro: tiempo mínimo en el servidor
      if (gw.requirements?.serverAgeMs) {
        const timeInServer = Date.now() - member.joinedTimestamp;
        if (timeInServer < gw.requirements.serverAgeMs) continue;
      }

      filtered.push(userId);
    }
    pool = filtered;
  }

  if (!pool.length) return [];

  const winners   = [];
  const available = [...pool];
  for (let i = 0; i < Math.min(count, available.length); i++) {
    const idx = Math.floor(Math.random() * available.length);
    winners.push(available.splice(idx, 1)[0]);
  }
  return winners;
}

// ── Limpieza automática ────────────────────────────────────────────────────
function purgeOldEnded(days = 7) {
  const db      = load();
  const cutoff  = Date.now() - days * 86400000;
  let   removed = 0;

  for (const [id, gw] of Object.entries(db.giveaways)) {
    if (gw.status === "ended" && gw.endsAt < cutoff) {
      delete db.giveaways[id];
      removed++;
    }
  }

  if (removed > 0) save(db);
  return removed;
}

module.exports = {
  load, save,
  getGiveaway, getAllGiveaways, getActiveGiveaways,
  createGiveaway, updateGiveaway,
  addEntry, removeEntry, addThankEntry,
  getAuthorized, addAuthorized, removeAuthorized,
  pickWinnersWithRoles,
  purgeOldEnded,
};