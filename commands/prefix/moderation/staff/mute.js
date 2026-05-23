// commands/prefix/moderation/mute.js
const { EmbedBuilder } = require("discord.js");
const { MUTED_ROLE_ID } = require("../../../../config");
const { hasSupportRole, errorEmbed, hasModRole, canModerate, sendLog, parseDuration, formatDuration } = require("../../../../utils/mod");
const { getMute, setMute } = require("../../../../utils/mutes");

const activeTimers = new Map();

async function applyUnmute(guild, userId) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.remove(MUTED_ROLE_ID).catch(() => {});
    const { deleteMute } = require("../../../../utils/mutes");
    deleteMute(userId);
    activeTimers.delete(userId);
  } catch (err) {
    console.error(`[Mute] Error desmutando ${userId}:`, err.message);
  }
}

function scheduleMuteExpiry(guild, userId, expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) { applyUnmute(guild, userId); return; }

  if (remaining > 2_073_600_000) {
    const interval = setInterval(async () => {
      if (Date.now() >= expiresAt) {
        clearInterval(interval);
        await applyUnmute(guild, userId);
      }
    }, 60_000);
    activeTimers.set(userId, interval);
  } else {
    const timer = setTimeout(() => applyUnmute(guild, userId), remaining);
    activeTimers.set(userId, timer);
  }
}

async function resumeMutes(client) {
  const { loadMutes } = require("../../../../utils/mutes");
  const mutes = loadMutes();
  if (!Object.keys(mutes).length) return;
  console.log(`[Mute] Retomando ${Object.keys(mutes).length} mutes...`);

  for (const [userId, data] of Object.entries(mutes)) {
    try {
      const guild = client.guilds.cache.get(data.guildId);
      if (!guild) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) { const { deleteMute } = require("../../../utils/mutes"); deleteMute(userId); continue; }
      if (!member.roles.cache.has(MUTED_ROLE_ID)) await member.roles.add(MUTED_ROLE_ID).catch(() => {});
      if (data.expiresAt) scheduleMuteExpiry(guild, userId, data.expiresAt);
    } catch (err) {
      console.error(`[Mute] Error retomando ${userId}:`, err.message);
    }
  }
}

module.exports = {
  name: "mute",
  description: "Mutea a un usuario",
  async execute(msg, args) {
    if (!hasSupportRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const id = args[0]?.replace(/[<@!>]/g, "");
    const durationStr = args[1] ?? null;
    const reason = args.slice(durationStr ? 2 : 1).join(" ") || "Sin razón";

    if (!id) return msg.reply({ embeds: [errorEmbed("Uso: `!mute <@usuario> [duración] [razón]`\nEjemplos: `!mute @user 1h Spam` `!mute @user 30m`")] });

    const durationMs = durationStr ? parseDuration(durationStr) : null;
    if (durationStr && !durationMs) return msg.reply({ embeds: [errorEmbed("Duración inválida. Usa: `1s`, `1m`, `1h`, `1d`, `1w`, `1mo`, `1y`")] });

    try {
      const { resolveMember } = require("../../../../utils/mod");
      const member = await resolveMember(msg.guild, args[0]);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });
      if (member.id === msg.author.id) return msg.reply({ embeds: [errorEmbed("No puedes mutearte a ti mismo.")] });
      if (!canModerate(msg.member, member)) return msg.reply({ embeds: [errorEmbed("No puedes mutear a alguien con un rol igual o superior al tuyo.")] });
      if (getMute(id)) return msg.reply({ embeds: [errorEmbed("Ese usuario ya está muteado.")] });

      await member.roles.add(MUTED_ROLE_ID, reason);

      const expiresAt = durationMs ? Date.now() + durationMs : null;
      setMute(id, {
        userId: id,
        guildId: msg.guild.id,
        reason,
        mutedBy: msg.author.id,
        mutedAt: Date.now(),
        duration: durationMs,
        expiresAt,
      });

      if (expiresAt) scheduleMuteExpiry(msg.guild, id, expiresAt);

      const durationText = durationMs ? formatDuration(durationMs) : "Permanente";

      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle("🔇 Has sido silenciado")
            .addFields(
              { name: "Servidor", value: msg.guild.name, inline: true },
              { name: "Duración", value: durationText, inline: true },
              { name: "Razón", value: reason },
            )
            .setTimestamp()
        ]
      }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔇 Usuario Silenciado")
        .addFields(
          { name: "Usuario", value: `${member.user.tag}`, inline: true },
          { name: "ID", value: `\`${member.user.id}\``, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Duración", value: durationText, inline: true },
          { name: "Razón", value: reason },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      msg.reply({ embeds: [embed] });
      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("🔇 Mute — Log")
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Duración", value: durationText, inline: true },
          { name: "Razón", value: reason },
          { name: "Canal", value: `${msg.channel}`, inline: true },
        )
        .setTimestamp()
      );
    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  },
  resumeMutes,
};