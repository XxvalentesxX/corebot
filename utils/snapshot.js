// utils/snapshot.js
const fs = require("fs");
const path = require("path");

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "snapshot.json");

function saveSnapshot(data) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2));
}

function loadSnapshot() {
  if (!fs.existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
}

async function takeSnapshot(guild) {
  await guild.channels.fetch();
  await guild.roles.fetch();

  const channels = guild.channels.cache.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    parentId: c.parentId ?? null,
    position: c.position,
    topic: c.topic ?? null,
    nsfw: c.nsfw ?? false,
    rateLimitPerUser: c.rateLimitPerUser ?? 0,
    permissionOverwrites: c.permissionOverwrites?.cache.map((p) => ({
      id: p.id,
      type: p.type,
      allow: p.allow.bitfield.toString(),
      deny: p.deny.bitfield.toString(),
    })) ?? [],
  }));

  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      position: r.position,
      permissions: r.permissions.bitfield.toString(),
      mentionable: r.mentionable,
    }));

  const snapshot = {
    guildId: guild.id,
    takenAt: Date.now(),
    channels,
    roles,
  };

  saveSnapshot(snapshot);
  console.log(`[Snapshot] Guardado — ${channels.length} canales, ${roles.length} roles.`);
  return snapshot;
}

module.exports = { takeSnapshot, loadSnapshot, saveSnapshot };