// utils/tickets.js
const fs = require("fs");
const path = require("path");

const TICKETS_PATH = path.join(process.cwd(), "data", "tickets.json");

function load() {
  if (!fs.existsSync(TICKETS_PATH)) {
    const defaults = {
      config: {
        enabled: true,
        categoryId: "1310315930248548483",
        logChannelId: "1309405814255124551",
        buttons: { soporte: true, recompensas: true, apply: false, ally: true, report: true },
      },
      tickets: {},
      stats: {},
      counter: 0,
    };
    fs.mkdirSync(path.dirname(TICKETS_PATH), { recursive: true });
    fs.writeFileSync(TICKETS_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(TICKETS_PATH, "utf-8"));
}

function save(data) {
  fs.writeFileSync(TICKETS_PATH, JSON.stringify(data, null, 2));
}

function getConfig() { return load().config; }

function nextCounter() {
  const data = load();
  data.counter++;
  save(data);
  return data.counter;
}

// ── Tickets ────────────────────────────────────────────────────────────────

function getTicket(channelId) {
  return load().tickets[channelId] ?? null;
}

function getTicketByUser(userId, category) {
  const { tickets } = load();
  return Object.values(tickets).find(
    (t) => t.userId === userId && t.category === category && t.status !== "closed"
  ) ?? null;
}

function getUserOpenTickets(userId) {
  const { tickets } = load();
  return Object.values(tickets).filter((t) => t.userId === userId && t.status !== "closed");
}

function createTicket(channelId, data) {
  const db = load();
  db.tickets[channelId] = { channelId, ...data, status: "open", claimedBy: null, createdAt: Date.now(), messages: [] };
  save(db);
  return db.tickets[channelId];
}

function updateTicket(channelId, updates) {
  const db = load();
  if (!db.tickets[channelId]) return null;
  Object.assign(db.tickets[channelId], updates);
  save(db);
  return db.tickets[channelId];
}

function closeTicket(channelId) {
  return updateTicket(channelId, { status: "closed", closedAt: Date.now() });
}

function addMessage(channelId, msg) {
  const db = load();
  if (!db.tickets[channelId]) return;
  db.tickets[channelId].messages.push(msg);
  save(db);
}

// ── Stats ──────────────────────────────────────────────────────────────────

function addStat(staffId, stars) {
  const db = load();
  if (!db.stats[staffId]) db.stats[staffId] = { attended: 0, totalStars: 0, ratings: 0 };
  db.stats[staffId].attended++;
  if (stars) {
    db.stats[staffId].totalStars += stars;
    db.stats[staffId].ratings++;
  }
  save(db);
}

function getStats(staffId) {
  return load().stats[staffId] ?? { attended: 0, totalStars: 0, ratings: 0 };
}

module.exports = {
  load, save, getConfig, nextCounter,
  getTicket, getTicketByUser, getUserOpenTickets,
  createTicket, updateTicket, closeTicket, addMessage,
  addStat, getStats,
};