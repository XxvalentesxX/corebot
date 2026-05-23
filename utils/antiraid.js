// utils/antiraid.js
const fs = require("fs");
const path = require("path");

const ANTIRAID_PATH = path.join(process.cwd(), "data", "antiraid.json");
const BOTS_PATH = path.join(process.cwd(), "data", "bots.json");

function loadAntiraid() {
  if (!fs.existsSync(ANTIRAID_PATH)) {
    const defaults = {
      enabled: true,
      limit: 3,
      window: 60_000,
      whitelist: [],
      blacklist: [], // array de { id, type: "ban" | "watch" }
    };
    fs.mkdirSync(path.dirname(ANTIRAID_PATH), { recursive: true });
    fs.writeFileSync(ANTIRAID_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(ANTIRAID_PATH, "utf-8"));
}

function saveAntiraid(data) {
  fs.writeFileSync(ANTIRAID_PATH, JSON.stringify(data, null, 2));
}

// Devuelve la entrada de blacklist de un usuario, o null si no está
function getBlacklistEntry(config, userId) {
  return config.blacklist.find((e) => e.id === userId) ?? null;
}

// Agrega o actualiza una entrada en la blacklist
function setBlacklistEntry(config, userId, type) {
  const existing = config.blacklist.find((e) => e.id === userId);
  if (existing) {
    existing.type = type;
  } else {
    config.blacklist.push({ id: userId, type });
  }
}

// Quita una entrada de la blacklist
function removeBlacklistEntry(config, userId) {
  config.blacklist = config.blacklist.filter((e) => e.id !== userId);
}

function loadBots() {
  if (!fs.existsSync(BOTS_PATH)) {
    fs.writeFileSync(BOTS_PATH, "{}");
    return {};
  }
  return JSON.parse(fs.readFileSync(BOTS_PATH, "utf-8"));
}

function saveBots(data) {
  fs.writeFileSync(BOTS_PATH, JSON.stringify(data, null, 2));
}

function registerBot(botId, addedBy) {
  const bots = loadBots();
  bots[botId] = { botId, addedBy, addedAt: Date.now() };
  saveBots(bots);
}

function getBotInfo(botId) {
  return loadBots()[botId] ?? null;
}

module.exports = {
  loadAntiraid, saveAntiraid,
  getBlacklistEntry, setBlacklistEntry, removeBlacklistEntry,
  loadBots, saveBots, registerBot, getBotInfo,
};