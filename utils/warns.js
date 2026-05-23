// utils/warns.js
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const WARNS_PATH = path.join(process.cwd(), "data", "warns.json");
const UPLOADS_PATH = path.join(process.cwd(), "uploads", "warns");

function ensurePaths() {
  if (!fs.existsSync(WARNS_PATH)) {
    fs.mkdirSync(path.dirname(WARNS_PATH), { recursive: true });
    fs.writeFileSync(WARNS_PATH, "{}");
  }
  if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
  }
}

function loadWarns() {
  ensurePaths();
  return JSON.parse(fs.readFileSync(WARNS_PATH, "utf-8"));
}

function saveWarns(data) {
  fs.writeFileSync(WARNS_PATH, JSON.stringify(data, null, 2));
}

function getWarns(userId) {
  return loadWarns()[userId]?.warns ?? [];
}

function addWarn(userId, { reason, moderatorId, images = [] }) {
  const warns = loadWarns();
  if (!warns[userId]) warns[userId] = { warns: [] };

  const warn = {
    id: randomUUID(),
    number: warns[userId].warns.length + 1,
    reason,
    moderatorId,
    date: Date.now(),
    images,
  };

  warns[userId].warns.push(warn);
  saveWarns(warns);
  return warn;
}

function removeWarn(userId, warnId) {
  const warns = loadWarns();
  if (!warns[userId]) return null;

  const index = warns[userId].warns.findIndex((w) => w.id === warnId);
  if (index === -1) return null;

  const [removed] = warns[userId].warns.splice(index, 1);

  warns[userId].warns = warns[userId].warns.map((w, i) => ({
    ...w,
    number: i + 1,
  }));

  if (!warns[userId].warns.length) delete warns[userId];
  saveWarns(warns);

  removed.images.forEach((imgPath) => {
    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
  });

  return removed;
}

function editWarn(userId, warnId, { reason, images }) {
  const warns = loadWarns();
  if (!warns[userId]) return null;

  const warn = warns[userId].warns.find((w) => w.id === warnId);
  if (!warn) return null;

  const old = { ...warn };

  if (reason) warn.reason = reason;
  if (images !== undefined) {
    warn.images.forEach((imgPath) => {
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    });
    warn.images = images;
  }

  saveWarns(warns);
  return { old, updated: warn };
}

async function saveImage(attachment, warnId, index) {
  const ext = attachment.name.split(".").pop();
  const filename = `${warnId}_${index}.${ext}`;
  const filepath = path.join(UPLOADS_PATH, filename);

  const res = await fetch(attachment.url);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filepath, buffer);

  return filepath;
}

module.exports = { loadWarns, getWarns, addWarn, removeWarn, editWarn, saveImage };