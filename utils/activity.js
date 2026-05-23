// utils/activity.js
// Guarda el conteo de mensajes por usuario en data/activity.json
// Estructura: { "userId": { "YYYY-MM-DD": count, ... }, ... }

const fs   = require("fs");
const path = require("path");

const ACTIVITY_PATH = path.join(process.cwd(), "data", "activity.json");

function load() {
  if (!fs.existsSync(ACTIVITY_PATH)) {
    fs.mkdirSync(path.dirname(ACTIVITY_PATH), { recursive: true });
    fs.writeFileSync(ACTIVITY_PATH, "{}");
    return {};
  }
  try { return JSON.parse(fs.readFileSync(ACTIVITY_PATH, "utf-8")); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(ACTIVITY_PATH, JSON.stringify(data, null, 2));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** Registra un mensaje del usuario */
function recordMessage(userId) {
  const data = load();
  if (!data[userId]) data[userId] = {};
  const key = todayKey();
  data[userId][key] = (data[userId][key] ?? 0) + 1;
  save(data);
}

/**
 * Devuelve { total, byDay } para los últimos `days` días.
 * byDay = [ { date: "YYYY-MM-DD", count: N }, ... ] ordenado de más viejo a más nuevo
 */
function getActivity(userId, days = 7) {
  const data = load();
  const userData = data[userId] ?? {};

  const byDay = [];
  let total = 0;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key   = d.toISOString().slice(0, 10);
    const count = userData[key] ?? 0;
    byDay.push({ date: key, count });
    total += count;
  }

  return { total, byDay };
}

/** Purga entradas de más de 60 días para no acumular basura */
function purgeOld() {
  const data   = load();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const cutStr = cutoff.toISOString().slice(0, 10);

  for (const userId of Object.keys(data)) {
    for (const day of Object.keys(data[userId])) {
      if (day < cutStr) delete data[userId][day];
    }
    if (!Object.keys(data[userId]).length) delete data[userId];
  }
  save(data);
}

module.exports = { recordMessage, getActivity, purgeOld };