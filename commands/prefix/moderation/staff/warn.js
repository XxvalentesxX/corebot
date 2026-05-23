// commands/prefix/moderation/warn.js
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { hasSupportRole, errorEmbed, hasModRole, canModerate, sendLog } = require("../../../../utils/mod");
const { resolveMember } = require("../../../../utils/mod");
const { addWarn, saveImage } = require("../../../../utils/warns");

module.exports = {
  name: "warn",
  aliases: ["w"],
  description: "Advierte a un usuario",
  async execute(msg, args) {
    if (!hasSupportRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const target = args[0];
    const reason = args.slice(1).join(" ") || "Sin razón";

    if (!target) return msg.reply({
      embeds: [errorEmbed("Uso: `!warn <@usuario> [razón]`")]
    });

    try {
      const member = await resolveMember(msg.guild, target);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });
      if (member.id === msg.author.id) return msg.reply({ embeds: [errorEmbed("No puedes advertirte a ti mismo.")] });
      if (!canModerate(msg.member, member)) return msg.reply({ embeds: [errorEmbed("No puedes advertir a alguien con un rol igual o superior al tuyo.")] });

      // Guarda imágenes adjuntas
      const attachments = [...msg.attachments.values()].filter((a) =>
        a.contentType?.startsWith("image/")
      );

      const warnId = require("crypto").randomUUID();
      const images = [];

      for (let i = 0; i < attachments.length; i++) {
        const filepath = await saveImage(attachments[i], warnId, i);
        images.push(filepath);
      }

      const warn = addWarn(member.id, {
        reason,
        moderatorId: msg.author.id,
        images,
      });

      const totalWarns = require("../../../../utils/warns").getWarns(member.id).length;

      // Notifica al usuario
      await member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf39c12)
            .setTitle("⚠️ Has recibido una advertencia")
            .addFields(
              { name: "Servidor", value: msg.guild.name, inline: true },
              { name: "Advertencia #", value: `${warn.number}`, inline: true },
              { name: "Razón", value: reason },
            )
            .setTimestamp()
        ]
      }).catch(() => {});

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Usuario Advertido")
        .addFields(
          { name: "Usuario", value: `${member.user.tag}`, inline: true },
          { name: "ID", value: `\`${member.user.id}\``, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Advertencia #", value: `${warn.number}`, inline: true },
          { name: "Total warns", value: `${totalWarns}`, inline: true },
          { name: "Razón", value: reason },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

      if (images.length) embed.setImage(`attachment://${require("path").basename(images[0])}`);

      const files = images.map((p) => new AttachmentBuilder(p));
      msg.reply({ embeds: [embed], files });

      // Log
      const logEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("⚠️ Warn — Log")
        .addFields(
          { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
          { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          { name: "Advertencia #", value: `${warn.number}`, inline: true },
          { name: "Razón", value: reason },
          { name: "Canal", value: `${msg.channel}`, inline: true },
          { name: "Imágenes", value: images.length ? `${images.length} imagen(es)` : "Ninguna", inline: true },
        )
        .setTimestamp();

      if (images.length) logEmbed.setImage(`attachment://${require("path").basename(images[0])}`);
      await sendLog(msg.guild, logEmbed, files);

    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  }
};