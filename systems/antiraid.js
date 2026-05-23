// systems/antiraid.js
const { EmbedBuilder } = require("discord.js");
const { ANTIRAID_LOG_ID, PROTECTED_ROLE_ID, OWNERS } = require("../config");
const { loadAntiraid, getBlacklistEntry } = require("../utils/antiraid");
const { loadSnapshot } = require("../utils/snapshot");
const { registerBot, getBotInfo } = require("../utils/antiraid");

const actionMap = new Map();
const changeMap = new Map();

let BOT_ID = null;

function recordAction(userId) {
  const now = Date.now();
  const config = loadAntiraid();
  if (!actionMap.has(userId)) actionMap.set(userId, []);
  const actions = actionMap.get(userId).filter((t) => now - t < config.window);
  actions.push(now);
  actionMap.set(userId, actions);
  return actions.length;
}

function recordChange(userId, change) {
  if (!changeMap.has(userId)) changeMap.set(userId, []);
  changeMap.get(userId).push(change);
}

function isProtected(member, guild) {
  const protectedRole = guild.roles.cache.get(PROTECTED_ROLE_ID);
  if (!protectedRole) return false;
  return member.roles.highest.position >= protectedRole.position;
}

async function sendAntiraidLog(guild, embed, content = null) {
  const channel = guild.channels.cache.get(ANTIRAID_LOG_ID);
  if (!channel) return;
  await channel.send({ content: content ?? undefined, embeds: [embed] }).catch(() => {});
}

async function lockdown(guild) {
  try {
    await guild.setVerificationLevel(4);
    console.log("[Antiraid] Lockdown activado.");
  } catch (err) {
    console.error("[Antiraid] Error en lockdown:", err.message);
  }
}

async function revertChanges(guild, changes) {
  const snapshot = loadSnapshot();
  if (!snapshot) return;

  for (const change of changes) {
    try {
      if (change.type === "channelDelete") {
        const snap = snapshot.channels.find((c) => c.id === change.targetId);
        if (!snap) continue;
        const created = await guild.channels.create({
          name: snap.name,
          type: snap.type,
          parent: snap.parentId,
          position: snap.position,
          topic: snap.topic,
          nsfw: snap.nsfw,
          rateLimitPerUser: snap.rateLimitPerUser,
        });
        for (const perm of snap.permissionOverwrites) {
          await created.permissionOverwrites.create(perm.id, {
            allow: BigInt(perm.allow),
            deny: BigInt(perm.deny),
          }).catch(() => {});
        }
      }

      if (change.type === "roleDelete") {
        const snap = snapshot.roles.find((r) => r.id === change.targetId);
        if (!snap) continue;
        await guild.roles.create({
          name: snap.name,
          color: snap.color,
          hoist: snap.hoist,
          permissions: BigInt(snap.permissions),
          mentionable: snap.mentionable,
          position: snap.position,
        }).catch(() => {});
      }

      if (change.type === "channelEdit") {
        const snap = snapshot.channels.find((c) => c.id === change.targetId);
        const channel = guild.channels.cache.get(change.targetId);
        if (!snap || !channel) continue;
        await channel.edit({
          name: snap.name,
          topic: snap.topic,
          nsfw: snap.nsfw,
          rateLimitPerUser: snap.rateLimitPerUser,
        }).catch(() => {});
      }

      if (change.type === "roleEdit") {
        const snap = snapshot.roles.find((r) => r.id === change.targetId);
        const role = guild.roles.cache.get(change.targetId);
        if (!snap || !role) continue;
        await role.edit({
          name: snap.name,
          color: snap.color,
          permissions: BigInt(snap.permissions),
          hoist: snap.hoist,
          mentionable: snap.mentionable,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[Antiraid] Error revirtiendo cambio:", err.message);
    }
  }
}

async function handleAction(guild, userId, actionType, targetId) {
  if (userId === BOT_ID) return;

  const config = loadAntiraid();
  if (!config.enabled) return;
  if (config.whitelist.includes(userId)) return;
  if (OWNERS.includes(userId)) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  if (isProtected(member, guild)) {
    await sendAntiraidLog(
      guild,
      new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Posible Raid — No se pudo actuar")
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${userId}\`)`, inline: true },
          { name: "Acción", value: actionType, inline: true },
          { name: "Motivo", value: "El usuario tiene roles superiores al bot." },
        )
        .setTimestamp(),
      OWNERS.map((id) => `<@${id}>`).join(" ")
    );
    return;
  }

  recordChange(userId, { type: actionType, targetId });
  const count = recordAction(userId);

  if (count >= config.limit) {
    actionMap.delete(userId);
    const changes = changeMap.get(userId) ?? [];
    changeMap.delete(userId);

    if (member.user.bot) {
      const botInfo = getBotInfo(userId);
      if (botInfo) {
        const adder = await guild.members.fetch(botInfo.addedBy).catch(() => null);
        if (adder && !isProtected(adder, guild) && !OWNERS.includes(adder.id)) {
          await adder.ban({ reason: "Sospecha de raid — agregó bot raider" }).catch(() => {});
          await sendAntiraidLog(guild, new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🚨 Bot Raider — Agregador Baneado")
            .addFields(
              { name: "Bot", value: `${member.user.tag} (\`${userId}\`)`, inline: true },
              { name: "Agregado por", value: `${adder.user.tag} (\`${adder.id}\`)`, inline: true },
            )
            .setTimestamp()
          );
        }
      }
    }

    const banned = await member.ban({ reason: "Sospecha de raid" }).catch(() => null);
    await lockdown(guild);
    await revertChanges(guild, changes);

    await sendAntiraidLog(guild, new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🚨 Raid Detectado")
      .addFields(
        { name: "Usuario", value: `${member.user.tag} (\`${userId}\`)`, inline: true },
        { name: "Baneado", value: banned ? "✅ Sí" : "❌ No", inline: true },
        { name: "Acciones detectadas", value: `${changes.length}`, inline: true },
        { name: "Acción final", value: actionType, inline: true },
        { name: "Cambios revertidos", value: `${changes.length}`, inline: true },
        { name: "Lockdown", value: "✅ Activado", inline: true },
      )
      .setTimestamp(),
      OWNERS.map((id) => `<@${id}>`).join(" ")
    );
  }
}

function setupAntiraid(client) {
  client.once("clientReady", () => {
    BOT_ID = client.user.id;
  });

  client.on("guildMemberAdd", async (member) => {
    const config = loadAntiraid();
    const entry = getBlacklistEntry(config, member.id);

    if (entry) {
      if (entry.type === "ban") {
        // Ban permanente — banea al entrar
        await member.ban({ reason: "Blacklist antiraid (ban permanente)" }).catch(() => {});
        const channel = member.guild.channels.cache.get(ANTIRAID_LOG_ID);
        if (channel) {
          await channel.send({
            content: OWNERS.map((id) => `<@${id}>`).join(" "),
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle("🚫 Blacklist — Usuario Baneado al Entrar")
                .addFields(
                  { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                  { name: "Tipo", value: "🚫 Ban permanente", inline: true },
                )
                .setTimestamp()
            ],
          }).catch(() => {});
        }
      } else if (entry.type === "watch") {
        // Watchlist — solo notifica a owners
        const channel = member.guild.channels.cache.get(ANTIRAID_LOG_ID);
        if (channel) {
          await channel.send({
            content: OWNERS.map((id) => `<@${id}>`).join(" "),
            embeds: [
              new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle("👁️ Watchlist — Usuario Entró al Server")
                .addFields(
                  { name: "Usuario", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
                  { name: "Tipo", value: "👁️ Seguimiento", inline: true },
                )
                .setTimestamp()
            ],
          }).catch(() => {});
        }
      }
      // Si es ban, no sigue procesando
      if (entry.type === "ban") return;
    }

    // Solo para bots: registrar quién lo agregó
    if (!member.user.bot) return;

    const logs = await member.guild.fetchAuditLogs({ type: 28, limit: 1 }).catch(() => null);
    const addedByEntry = logs?.entries.first();
    const addedBy = addedByEntry?.executor?.id ?? "desconocido";

    registerBot(member.id, addedBy);

    await sendAntiraidLog(member.guild, new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("🤖 Bot Agregado")
      .addFields(
        { name: "Bot", value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
        { name: "Agregado por", value: addedBy !== "desconocido" ? `<@${addedBy}>` : "Desconocido", inline: true },
      )
      .setTimestamp()
    );
  });

  const getExecutor = async (guild, auditType) => {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 }).catch(() => null);
    return logs?.entries.first()?.executor?.id ?? null;
  };

  client.on("channelCreate", async (channel) => {
    const userId = await getExecutor(channel.guild, 10);
    if (userId && userId !== BOT_ID) await handleAction(channel.guild, userId, "channelCreate", channel.id);
  });

  client.on("channelDelete", async (channel) => {
    const userId = await getExecutor(channel.guild, 12);
    if (userId && userId !== BOT_ID) await handleAction(channel.guild, userId, "channelDelete", channel.id);
  });

  client.on("channelUpdate", async (_, newChannel) => {
    const userId = await getExecutor(newChannel.guild, 11);
    if (userId && userId !== BOT_ID) await handleAction(newChannel.guild, userId, "channelEdit", newChannel.id);
  });

  client.on("roleCreate", async (role) => {
    const userId = await getExecutor(role.guild, 30);
    if (userId && userId !== BOT_ID) await handleAction(role.guild, userId, "roleCreate", role.id);
  });

  client.on("roleDelete", async (role) => {
    const userId = await getExecutor(role.guild, 32);
    if (userId && userId !== BOT_ID) await handleAction(role.guild, userId, "roleDelete", role.id);
  });

  client.on("roleUpdate", async (_, newRole) => {
    const userId = await getExecutor(newRole.guild, 31);
    if (userId && userId !== BOT_ID) await handleAction(newRole.guild, userId, "roleEdit", newRole.id);
  });

  client.on("guildBanAdd", async (ban) => {
    const userId = await getExecutor(ban.guild, 22);
    if (userId && userId !== BOT_ID) await handleAction(ban.guild, userId, "ban", ban.user.id);
  });

  console.log("[Antiraid] Sistema iniciado.");
}

module.exports = { setupAntiraid };