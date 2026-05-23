// commands/prefix/moderation/unban.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed, hasModRole, sendLog } = require("../../../../utils/mod");

module.exports = {
  name: "unban",
  description: "Desbanea a un usuario",
  async execute(msg, args) {
    if (!hasModRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const id = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "Sin razón";

    if (!id) return msg.reply({ embeds: [errorEmbed("Uso: `!unban <id> [razón]`")] });

    try {
      const ban = await msg.guild.bans.fetch(id).catch(() => null);
      if (!ban) return msg.reply({ embeds: [errorEmbed("Ese usuario no está baneado.")] });

      await msg.guild.bans.remove(id, reason);

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Usuario Desbaneado")
        .addFields(
          { name: "Usuario", value: `${ban.user.tag}`, inline: true },
          { name: "ID", value: `\`${id}\``, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Razón", value: reason },
        )
        .setThumbnail(ban.user.displayAvatarURL())
        .setTimestamp();

      msg.reply({ embeds: [embed] });
      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ Unban — Log")
        .addFields(
          { name: "Usuario", value: `${ban.user.tag} (\`${id}\`)`, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Razón", value: reason },
          { name: "Canal", value: `${msg.channel}`, inline: true },
        )
        .setTimestamp()
      );
    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  }
};