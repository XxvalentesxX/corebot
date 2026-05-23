// utils/mod.js
const { EmbedBuilder } = require("discord.js");
const { LOG_CHANNEL_ID } = require("../config");
const { MOD_ROLE_ID, SUPPORT_ROLE_ID } = require("../config");

function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setDescription(`❌ ${description}`);
}

function hasModRole(member) {
  return member.roles.cache.some((r) => r.position >= member.guild.roles.cache.get(MOD_ROLE_ID)?.position);
}

function canModerate(moderator, target) {
  return moderator.roles.highest.position > target.roles.highest.position;
}

async function sendLog(guild, embed, files = []) {
  const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ embeds: [embed], files }).catch(() => {});
}

function parseDuration(str) {
  const units = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    mo: 2_592_000_000,
    y: 31_536_000_000,
  };
  const match = str.match(/^(\d+)(s|mo|m|h|d|w|y)$/);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2];
  const ms = amount * units[unit];
  const maxMs = 365 * 86_400_000; // 1 año máximo
  return Math.min(ms, maxMs);
}
// utils/mod.js — agrega esta función
async function resolveMember(guild, input) {
  // Limpia mención o ID
  const id = input.replace(/[<@!>]/g, "");

  // Intenta por ID primero
  const byId = await guild.members.fetch(id).catch(() => null);
  if (byId) return byId;

  // Intenta por username o displayName
  await guild.members.fetch(); // carga el cache
  const byName = guild.members.cache.find(
    (m) =>
      m.user.username.toLowerCase() === input.toLowerCase() ||
      m.user.tag.toLowerCase() === input.toLowerCase() ||
      m.displayName.toLowerCase() === input.toLowerCase()
  );

  return byName ?? null;
}

function hasModRole(member) {
  return member.roles.cache.some(
    (r) => r.position >= member.guild.roles.cache.get(MOD_ROLE_ID)?.position
  );
}

function hasSupportRole(member) {
  return member.roles.cache.some(
    (r) => r.position >= member.guild.roles.cache.get(SUPPORT_ROLE_ID)?.position
  );
}
function formatDuration(ms) {
  if (!ms) return "Permanente";
  const units = [
    [31_536_000_000, "año", "años"],
    [2_592_000_000, "mes", "meses"],
    [604_800_000, "semana", "semanas"],
    [86_400_000, "día", "días"],
    [3_600_000, "hora", "horas"],
    [60_000, "minuto", "minutos"],
    [1_000, "segundo", "segundos"],
  ];
  const parts = [];
  let remaining = ms;
  for (const [unit, singular, plural] of units) {
    const amount = Math.floor(remaining / unit);
    if (amount > 0) {
      parts.push(`${amount} ${amount === 1 ? singular : plural}`);
      remaining -= amount * unit;
    }
  }
  return parts.slice(0, 2).join(" y ") || "menos de un segundo";
}

module.exports = { errorEmbed, hasModRole, canModerate, sendLog, parseDuration, formatDuration, resolveMember, hasSupportRole };