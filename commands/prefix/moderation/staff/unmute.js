// commands/prefix/moderation/unmute.js
const { EmbedBuilder } = require("discord.js");
const { MUTED_ROLE_ID } = require("../../../../config");
const { hasSupportRole, errorEmbed, hasModRole, sendLog, formatDuration } = require("../../../../utils/mod");
const { getMute, deleteMute } = require("../../../../utils/mutes");

module.exports = {
  name: "unmute",
  description: "Desmutea a un usuario",
  async execute(msg, args) {
    if (!hasSupportRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const id = args[0]?.replace(/[<@!>]/g, "");
    if (!id) return msg.reply({ embeds: [errorEmbed("Uso: `!unmute <@usuario>`")] });

    try {
      const { resolveMember } = require("../../../../utils/mod");
      const member = await resolveMember(msg.guild, args[0]);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });

      const muteData = getMute(id);
      if (!muteData || !member.roles.cache.has(MUTED_ROLE_ID))
        return msg.reply({ embeds: [errorEmbed("Ese usuario no está muteado.")] });

      await member.roles.remove(MUTED_ROLE_ID);
      deleteMute(id);

      const timeElapsed = formatDuration(Date.now() - muteData.mutedAt);
      const originalDuration = muteData.duration ? formatDuration(muteData.duration) : "Permanente";
      const mutedBy = await msg.guild.members.fetch(muteData.mutedBy).catch(() => null);

      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("🔊 Tu silencio ha sido removido")
            .addFields(
              { name: "Servidor", value: msg.guild.name, inline: true },
              { name: "Tiempo muteado", value: timeElapsed, inline: true },
            )
            .setTimestamp()
        ]
      }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🔊 Usuario Desmuteado")
        .addFields(
          { name: "Usuario", value: `${member.user.tag}`, inline: true },
          { name: "ID", value: `\`${member.user.id}\``, inline: true },
          { name: "Desmuteado por", value: `${msg.author.tag}`, inline: true },
          { name: "Muteado por", value: mutedBy ? `${mutedBy.user.tag}` : `\`${muteData.mutedBy}\``, inline: true },
          { name: "Razón original", value: muteData.reason, inline: true },
          { name: "Duración original", value: originalDuration, inline: true },
          { name: "Tiempo muteado", value: timeElapsed, inline: true },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      msg.reply({ embeds: [embed] });
      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🔊 Unmute — Log")
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
          { name: "Desmuteado por", value: `${msg.author.tag}`, inline: true },
          { name: "Muteado por", value: mutedBy ? `${mutedBy.user.tag}` : `\`${muteData.mutedBy}\``, inline: true },
          { name: "Razón original", value: muteData.reason, inline: true },
          { name: "Duración original", value: originalDuration, inline: true },
          { name: "Tiempo muteado", value: timeElapsed, inline: true },
          { name: "Canal", value: `${msg.channel}`, inline: true },
        )
        .setTimestamp()
      );
    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  }
};