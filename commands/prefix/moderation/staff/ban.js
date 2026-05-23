// commands/prefix/moderation/ban.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed, hasModRole, canModerate, sendLog } = require("../../../../utils/mod");

module.exports = {
  name: "ban",
  description: "Banea a un usuario",
  async execute(msg, args) {
    if (!hasModRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const id = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "Sin razón";

    if (!id) return msg.reply({ embeds: [errorEmbed("Uso: `!ban <@usuario> [razón]`")] });

    try {
      const { resolveMember } = require("../../../../utils/mod");
      const member = await resolveMember(msg.guild, args[0]);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });
      if (!member.bannable) return msg.reply({ embeds: [errorEmbed("No puedo banear a ese usuario.")] });
      if (member.id === msg.author.id) return msg.reply({ embeds: [errorEmbed("No puedes banearte a ti mismo.")] });
      if (!canModerate(msg.member, member)) return msg.reply({ embeds: [errorEmbed("No puedes banear a alguien con un rol igual o superior al tuyo.")] });

      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle("🔨 Has sido baneado")
            .addFields(
              { name: "Servidor", value: msg.guild.name, inline: true },
              { name: "Razón", value: reason },
            )
            .setTimestamp()
        ]
      }).catch(() => {});

      await member.ban({ reason });

      const embed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔨 Usuario Baneado")
        .addFields(
          { name: "Usuario", value: `${member.user.tag}`, inline: true },
          { name: "ID", value: `\`${member.user.id}\``, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Razón", value: reason },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      msg.reply({ embeds: [embed] });
      await sendLog(msg.guild, new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔨 Ban — Log")
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
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