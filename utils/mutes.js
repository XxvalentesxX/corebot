// utils/mutes.js
const fs = require("fs");
const path = require("path");

const MUTES_PATH = path.join(process.cwd(), "data", "mutes.json");

function loadMutes() {
  if (!fs.existsSync(MUTES_PATH)) {
    fs.mkdirSync(path.dirname(MUTES_PATH), { recursive: true });
    fs.writeFileSync(MUTES_PATH, "{}");
  }
  return JSON.parse(fs.readFileSync(MUTES_PATH, "utf-8"));
}

function saveMutes(data) {
  fs.writeFileSync(MUTES_PATH, JSON.stringify(data, null, 2));
}

function getMute(userId) {
  return loadMutes()[userId] ?? null;
}

function setMute(userId, data) {
  const mutes = loadMutes();
  mutes[userId] = data;
  saveMutes(mutes);
}

function deleteMute(userId) {
  const mutes = loadMutes();
  delete mutes[userId];
  saveMutes(mutes);
}

module.exports = { loadMutes, saveMutes, getMute, setMute, deleteMute };