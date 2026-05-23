// systems/automod.js
const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { AUTOMOD_LOG_ID, MUTED_ROLE_ID, OWNERS } = require("../config");
const { setMute } = require("../utils/mutes");

const AUTOMOD_PATH = path.join(process.cwd(), "data", "automod.json");

function loadAutomod() {
  if (!fs.existsSync(AUTOMOD_PATH)) {
    const defaults = {
      enabled: true,
      antiflood: {
        enabled: true,
        repeatedCount: 3,
        burstCount: 5,
        burstWindow: 3000,
        warnLimit: 3,
        warnResetMs: 3_600_000,
        muteDurationMs: 1_200_000,
      },
      antispam: {
        enabled: true,
        allowedDomains: [],
        warnLimit: 3,
        warnResetMs: 3_600_000,
        muteDurationMs: 1_200_000,
      },
      antiwords: {
        enabled: true,
        groups: [],
      },
      antighost: {
        enabled: true,
        warnLimit: 3,
        warnResetMs: 3_600_000,
        muteDurationMs: 1_200_000,
      },
    };
    fs.mkdirSync(path.dirname(AUTOMOD_PATH), { recursive: true });
    fs.writeFileSync(AUTOMOD_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(AUTOMOD_PATH, "utf-8"));
}

function saveAutomod(data) {
  fs.writeFileSync(AUTOMOD_PATH, JSON.stringify(data, null, 2));
}

// ── Tracking en memoria ────────────────────────────────────────────────────
// floods[userId] = { messages: [{ content, timestamp }], warnings: N, lastWarnReset: ts }
// spams[userId]  = { warnings: N, lastWarnReset: ts }
// words[userId]  = { warnings: { [groupId]: N }, lastWarnReset: { [groupId]: ts } }
const floods = new Map();
const spams  = new Map();
const words  = new Map();
const ghosts = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.get(AUTOMOD_LOG_ID);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}


async function applyMute(member, guild, durationMs, reason) {
  const mutedRole = guild.roles.cache.get(MUTED_ROLE_ID);
  if (!mutedRole) return;

  await member.roles.add(mutedRole, reason).catch(() => {});

  const endsAt = durationMs ? Date.now() + durationMs : null;
  setMute(member.id, {
    userId: member.id,
    mutedBy: guild.members.me?.id ?? "automod",
    reason,
    mutedAt: Date.now(),
    endsAt,
    guildId: guild.id,
  });

  if (durationMs) {
    setTimeout(async () => {
      const m = await guild.members.fetch(member.id).catch(() => null);
      if (m) await m.roles.remove(mutedRole, "Automod: mute expirado").catch(() => {});
    }, durationMs);
  }
}

function formatMs(ms) {
  if (!ms) return "permanente";
  const units = [
    [3_600_000, "h"],
    [60_000, "min"],
    [1_000, "s"],
  ];
  const parts = [];
  let r = ms;
  for (const [u, label] of units) {
    const n = Math.floor(r / u);
    if (n) { parts.push(`${n}${label}`); r -= n * u; }
  }
  return parts.join(" ") || "<1s";
}

function isExempt(member) {
  // Solo owners y bots están exentos del automod
  return OWNERS.includes(member.id) || member.user.bot;
}

function isDomainAllowed(url, allowedDomains) {
  if (!allowedDomains.length) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const URL_REGEX = /https?:\/\/[^\s]+/gi;

// ── Antiflood ──────────────────────────────────────────────────────────────
async function handleFlood(msg, config) {
  const cfg = config.antiflood;
  if (!cfg.enabled) return;

  const userId = msg.author.id;
  const now = Date.now();

  if (!floods.has(userId)) floods.set(userId, { messages: [], warnings: 0, lastWarnReset: now });
  const data = floods.get(userId);

  // Reset advertencias si ya pasó el tiempo
  if (cfg.warnResetMs && now - data.lastWarnReset > cfg.warnResetMs) {
    data.warnings = 0;
    data.lastWarnReset = now;
  }

  // Agrega mensaje al historial
  data.messages.push({ content: msg.content, timestamp: now });
  // Solo guarda los últimos N relevantes para no crecer infinito
  data.messages = data.messages.filter((m) => now - m.timestamp < Math.max(cfg.burstWindow, 10_000));

  const recentBurst = data.messages.filter((m) => now - m.timestamp < cfg.burstWindow);
  const lastN = data.messages.slice(-cfg.repeatedCount);
  const allEqual = lastN.length >= cfg.repeatedCount && lastN.every((m) => m.content === msg.content);
  const isBurst = recentBurst.length >= cfg.burstCount;

  if (!allEqual && !isBurst) return;

  // Borra los mensajes recientes del canal
  await msg.channel.bulkDelete(
    (await msg.channel.messages.fetch({ limit: 10 })).filter((m) => m.author.id === userId),
    true
  ).catch(() => {});

  data.warnings++;
  data.messages = []; // resetea historial tras advertencia

  const reason = allEqual ? `${cfg.repeatedCount} mensajes iguales seguidos` : `${cfg.burstCount} mensajes en ${cfg.burstWindow / 1000}s`;

  if (data.warnings >= cfg.warnLimit) {
    data.warnings = 0;
    await applyMute(msg.member, msg.guild, cfg.muteDurationMs, `Automod — Antiflood: ${reason}`);

    await sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔇 Automod — Flood: Mute aplicado")
      .addFields(
        { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Motivo", value: reason, inline: true },
        { name: "Duración", value: formatMs(cfg.muteDurationMs), inline: true },
      )
      .setTimestamp()
    );

    await msg.channel.send({
      content: `<@${userId}> Has sido muteado por **${formatMs(cfg.muteDurationMs)}** por flood.`,
    }).catch(() => {});
  } else {
    await sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("⚠️ Automod — Flood: Advertencia")
      .addFields(
        { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Motivo", value: reason, inline: true },
        { name: "Advertencias", value: `${data.warnings}/${cfg.warnLimit}`, inline: true },
      )
      .setTimestamp()
    );

    await msg.channel.send({
      content: `<@${userId}> ⚠️ Advertencia ${data.warnings}/${cfg.warnLimit} — No hagas flood. A la ${cfg.warnLimit}ra serás muteado.`,
    }).catch(() => {});

  }
}

// ── Antispam (links) ───────────────────────────────────────────────────────
async function handleSpam(msg, config) {
  const cfg = config.antispam;
  if (!cfg.enabled) return;

  const urls = msg.content.match(URL_REGEX);
  if (!urls) return;

  // Si todos los links están permitidos, no hace nada
  const hasBlockedUrl = urls.some((url) => !isDomainAllowed(url, cfg.allowedDomains));
  if (!hasBlockedUrl) return;

  await msg.delete().catch(() => {});

  const userId = msg.author.id;
  const now = Date.now();

  if (!spams.has(userId)) spams.set(userId, { warnings: 0, lastWarnReset: now });
  const data = spams.get(userId);

  if (cfg.warnResetMs && now - data.lastWarnReset > cfg.warnResetMs) {
    data.warnings = 0;
    data.lastWarnReset = now;
  }

  data.warnings++;

  if (data.warnings >= cfg.warnLimit) {
    data.warnings = 0;
    await applyMute(msg.member, msg.guild, cfg.muteDurationMs, "Automod — Antispam: links repetidos");

    await sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔇 Automod — Spam: Mute aplicado")
      .addFields(
        { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Duración", value: formatMs(cfg.muteDurationMs), inline: true },
      )
      .setTimestamp()
    );

    await msg.channel.send({
      content: `<@${userId}> Has sido muteado por **${formatMs(cfg.muteDurationMs)}** por enviar links no permitidos.`,
    }).catch(() => {});
  } else {
    await sendLog(msg.guild, new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("⚠️ Automod — Spam: Advertencia")
      .addFields(
        { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
        { name: "Advertencias", value: `${data.warnings}/${cfg.warnLimit}`, inline: true },
      )
      .setTimestamp()
    );

    await msg.channel.send({
      content: `<@${userId}> ⚠️ Advertencia ${data.warnings}/${cfg.warnLimit} — No envíes links. A la ${cfg.warnLimit}ra serás muteado.`,
    }).catch(() => {});

  }
}

// ── Antiwords ──────────────────────────────────────────────────────────────
async function handleWords(msg, config) {
  const cfg = config.antiwords;
  if (!cfg.enabled || !cfg.groups.length) return;

  const content = msg.content.toLowerCase();
  const userId = msg.author.id;
  const now = Date.now();

  for (const group of cfg.groups) {
    if (!group.enabled) continue;

    const matched = group.words.find((w) => content.includes(w.toLowerCase()));
    if (!matched) continue;

    await msg.delete().catch(() => {});

    if (!words.has(userId)) words.set(userId, { warnings: {}, lastWarnReset: {} });
    const data = words.get(userId);

    if (!data.warnings[group.id]) { data.warnings[group.id] = 0; data.lastWarnReset[group.id] = now; }

    if (group.warnResetMs && now - data.lastWarnReset[group.id] > group.warnResetMs) {
      data.warnings[group.id] = 0;
      data.lastWarnReset[group.id] = now;
    }

    data.warnings[group.id]++;

    if (data.warnings[group.id] >= group.warnLimit) {
      data.warnings[group.id] = 0;
      await applyMute(msg.member, msg.guild, group.muteDurationMs, `Automod — Palabra prohibida: "${matched}" (grupo: ${group.name})`);

      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔇 Automod — Palabra Prohibida: Mute aplicado")
        .addFields(
          { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
          { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
          { name: "Grupo", value: group.name, inline: true },
          { name: "Palabra detectada", value: `\`${matched}\``, inline: true },
          { name: "Duración", value: formatMs(group.muteDurationMs), inline: true },
        )
        .setTimestamp()
      );

      await msg.channel.send({
        content: `<@${userId}> Has sido muteado por **${formatMs(group.muteDurationMs)}** por usar palabras prohibidas.`,
      }).catch(() => {});
    } else {
      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Automod — Palabra Prohibida: Advertencia")
        .addFields(
          { name: "Usuario", value: `${msg.author.tag} (\`${userId}\`)`, inline: true },
          { name: "Canal", value: `<#${msg.channel.id}>`, inline: true },
          { name: "Grupo", value: group.name, inline: true },
          { name: "Palabra detectada", value: `\`${matched}\``, inline: true },
          { name: "Advertencias", value: `${data.warnings[group.id]}/${group.warnLimit}`, inline: true },
        )
        .setTimestamp()
      );

      await msg.channel.send({
        content: `<@${userId}> ⚠️ Advertencia ${data.warnings[group.id]}/${group.warnLimit} — Usa un lenguaje apropiado.`,
      }).catch(() => {});

    }

    break; // un grupo por mensaje es suficiente
  }
}

// Verifica si un usuario tiene rol de staff (para detectar menciones a ellos)
function isStaffMember(member) {
  const { SUPPORT_ROLE_ID } = require("../config");
  const role = member.guild.roles.cache.get(SUPPORT_ROLE_ID);
  if (!role) return false;
  return member.roles.highest.position >= role.position;
}

// Devuelve true si el mensaje menciona a alguien del staff
async function mentionsStaff(msg) {
  if (!msg.mentions.users.size && !msg.mentions.roles.size) return false;

  // Chequea menciones de usuarios
  for (const [, user] of msg.mentions.users) {
    if (user.bot) continue;
    const member = await msg.guild.members.fetch(user.id).catch(() => null);
    if (member && isStaffMember(member)) return true;
  }

  // Chequea menciones de roles — si el rol mencionado es >= SUPPORT_ROLE_ID se considera staff
  const { SUPPORT_ROLE_ID } = require("../config");
  const supportRole = msg.guild.roles.cache.get(SUPPORT_ROLE_ID);
  if (supportRole) {
    for (const [, role] of msg.mentions.roles) {
      if (role.position >= supportRole.position) return true;
    }
  }

  return false;
}

// ── Antighost ping ─────────────────────────────────────────────────────────
async function handleGhost(member, guild, channel, config, triggerType) {
  const cfg = config.antighost;
  if (!cfg.enabled) return;

  const userId = member.id;
  const now = Date.now();

  if (!ghosts.has(userId)) ghosts.set(userId, { warnings: 0, lastWarnReset: now });
  const data = ghosts.get(userId);

  if (cfg.warnResetMs && now - data.lastWarnReset > cfg.warnResetMs) {
    data.warnings = 0;
    data.lastWarnReset = now;
  }

  data.warnings++;

  const triggerText = triggerType === "delete"
    ? "borró un mensaje con mención a staff"
    : "editó un mensaje quitando una mención a staff";

  if (data.warnings >= cfg.warnLimit) {
    data.warnings = 0;
    await applyMute(member, guild, cfg.muteDurationMs, `Automod — Antighost: ${triggerText}`);

    await sendLog(guild, new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔇 Automod — Ghost Ping: Mute aplicado")
      .addFields(
        { name: "Usuario", value: `${member.user.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${channel.id}>`, inline: true },
        { name: "Acción", value: triggerText, inline: true },
        { name: "Duración", value: formatMs(cfg.muteDurationMs), inline: true },
      )
      .setTimestamp()
    );

    await channel.send({
      content: `<@${userId}> Has sido muteado por **${formatMs(cfg.muteDurationMs)}** por ghost ping a staff.`,
    }).catch(() => {});
  } else {
    await sendLog(guild, new EmbedBuilder()
      .setColor(0xf39c12)
      .setTitle("⚠️ Automod — Ghost Ping: Advertencia")
      .addFields(
        { name: "Usuario", value: `${member.user.tag} (\`${userId}\`)`, inline: true },
        { name: "Canal", value: `<#${channel.id}>`, inline: true },
        { name: "Acción", value: triggerText, inline: true },
        { name: "Advertencias", value: `${data.warnings}/${cfg.warnLimit}`, inline: true },
      )
      .setTimestamp()
    );

    await channel.send({
      content: `<@${userId}> ⚠️ Advertencia ${data.warnings}/${cfg.warnLimit} — No hagas ghost ping a staff.`,
    }).catch(() => {});
  }
}


function setupAutomod(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.guild || msg.author.bot) return;
    if (isExempt(msg.member)) return;

    const config = loadAutomod();
    if (!config.enabled) return;

    await handleFlood(msg, config);
    await handleSpam(msg, config);
    await handleWords(msg, config);
  });

  // ── Ghost ping: borrar mensaje con mención a staff ────────────────────────
  client.on("messageDelete", async (msg) => {
    if (!msg.guild || !msg.author || msg.author.bot) return;
    const member = await msg.guild.members.fetch(msg.author.id).catch(() => null);
    if (!member || isExempt(member)) return;

    const config = loadAutomod();
    if (!config.enabled || !config.antighost?.enabled) return;

    const hadStaffMention = await mentionsStaff(msg);
    if (!hadStaffMention) return;

    await handleGhost(member, msg.guild, msg.channel, config, "delete");
  });

  // ── Ghost ping: editar mensaje quitando mención a staff ───────────────────
  client.on("messageUpdate", async (oldMsg, newMsg) => {
    if (!oldMsg.guild || !oldMsg.author || oldMsg.author.bot) return;
    const member = await oldMsg.guild.members.fetch(oldMsg.author.id).catch(() => null);
    if (!member || isExempt(member)) return;

    const config = loadAutomod();
    if (!config.enabled || !config.antighost?.enabled) return;

    // Solo actúa si el mensaje viejo tenía mención a staff y el nuevo no
    const oldHad = await mentionsStaff(oldMsg);
    const newHas = await mentionsStaff(newMsg);
    if (!oldHad || newHas) return;

    await handleGhost(member, oldMsg.guild, oldMsg.channel, config, "edit");
  });

  // ── Ghost ping: mencionar staff y borrar el mensaje manualmente ───────────
  // (cubierto por messageCreate + messageDelete, no necesita lógica extra)


}

module.exports = { setupAutomod, loadAutomod, saveAutomod };