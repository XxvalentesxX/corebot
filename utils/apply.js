// utils/apply.js
const fs   = require("fs");
const path = require("path");

const APPLY_PATH = path.join(process.cwd(), "data", "apply.json");

function load() {
  if (!fs.existsSync(APPLY_PATH)) {
    const defaults = { open: false, questions: [], applicants: {} };
    fs.mkdirSync(path.dirname(APPLY_PATH), { recursive: true });
    fs.writeFileSync(APPLY_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(APPLY_PATH, "utf-8"));
}

function save(data) {
  fs.writeFileSync(APPLY_PATH, JSON.stringify(data, null, 2));
}

function getConfig()    { return load(); }
function isOpen()       { return load().open; }
function getQuestions() { return load().questions; }

// applicants[userId] = { status: "pending"|"accepted"|"rejected", channelId, formMessageId, appliedAt }
function getApplicant(userId)    { return load().applicants[userId] ?? null; }
function setApplicant(userId, data) {
  const db = load();
  db.applicants[userId] = { ...db.applicants[userId], ...data };
  save(db);
}

function canApply(userId, guild) {
  const a = getApplicant(userId);
  if (!a) return true;
  // Puede volver a postularse si fue rechazado o aceptado (ya no tiene rol)
  return a.status === "rejected" || a.status === "accepted";
}

function openPostulations() {
  const db = load();
  db.open = true;
  // Resetea rejected y accepted para que puedan volver
  for (const id of Object.keys(db.applicants)) {
    if (db.applicants[id].status === "rejected" || db.applicants[id].status === "accepted") {
      db.applicants[id].status = "eligible";
    }
  }
  save(db);
}

function closePostulations() {
  const db = load();
  db.open = false;
  save(db);
}

module.exports = {
  load, save, getConfig, isOpen, getQuestions,
  getApplicant, setApplicant, canApply,
  openPostulations, closePostulations,
};