// commands/prefix/moderation/kick.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed, hasModRole, canModerate, sendLog } = require("../../../../utils/mod");

module.exports = {
  name: "kick",
  description: "Expulsa a un usuario",
  async execute(msg, args) {
    if (!hasModRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const id = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "Sin razón";

    if (!id) return msg.reply({ embeds: [errorEmbed("Uso: `!kick <@usuario> [razón]`")] });

    try {
      const { resolveMember } = require("../../../../utils/mod");
      const member = await resolveMember(msg.guild, args[0]);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });
      if (!member.kickable) return msg.reply({ embeds: [errorEmbed("No puedo expulsar a ese usuario.")] });
      if (member.id === msg.author.id) return msg.reply({ embeds: [errorEmbed("No puedes expulsarte a ti mismo.")] });
      if (!canModerate(msg.member, member)) return msg.reply({ embeds: [errorEmbed("No puedes expulsar a alguien con un rol igual o superior al tuyo.")] });

      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle("👢 Has sido expulsado")
            .addFields(
              { name: "Servidor", value: msg.guild.name, inline: true },
              { name: "Razón", value: reason },
            )
            .setTimestamp()
        ]
      }).catch(() => {});

      await member.kick(reason);

      const embed = new EmbedBuilder()
        .setColor(0xe67e22)
        .setTitle("👢 Usuario Expulsado")
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
        .setColor(0xe67e22)
        .setTitle("👢 Kick — Log")
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