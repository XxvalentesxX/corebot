// commands/prefix/moderation/unwarn.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  AttachmentBuilder,
} = require("discord.js");
const { hasSupportRole, errorEmbed, hasModRole, sendLog } = require("../../../../utils/mod");
const { resolveMember } = require("../../../../utils/mod");
const { getWarns, removeWarn } = require("../../../../utils/warns");
const path = require("path");
const fs = require("fs");

module.exports = {
  name: "unwarn",
  aliases: ["uw"],
  description: "Elimina un warn de un usuario",
  async execute(msg, args) {
    if (!hasSupportRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const target = args[0];
    const warnIdArg = args[1];

    if (!target) return msg.reply({
      embeds: [errorEmbed("Uso: `!unwarn <@usuario> [id_warn]`")]
    });

    try {
      const member = await resolveMember(msg.guild, target);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });

      const warns = getWarns(member.id);
      if (!warns.length) return msg.reply({
        embeds: [errorEmbed(`${member.user.tag} no tiene warns.`)]
      });

      // Si se pasa ID directo
      if (warnIdArg) {
        const warn = warns.find((w) => w.id === warnIdArg || w.number === parseInt(warnIdArg));
        if (!warn) return msg.reply({ embeds: [errorEmbed("No encontré ese warn.")] });

        const removed = removeWarn(member.id, warn.id);
        if (!removed) return;

        const files = removed.images
          .filter((p) => fs.existsSync(p))
          .map((p) => new AttachmentBuilder(p));

        const logEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🗑️ Unwarn — Log")
          .addFields(
            { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
            { name: "Eliminado por", value: `${msg.author.tag}`, inline: true },
            { name: "Warn #", value: `${removed.number}`, inline: true },
            { name: "Razón original", value: removed.reason },
            { name: "Imágenes de prueba", value: files.length ? `${files.length} imagen(es) adjunta(s)` : "Ninguna", inline: true },
          )
          .setTimestamp();

        if (files.length) logEmbed.setImage(`attachment://${path.basename(removed.images[0])}`);

        msg.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("✅ Warn Eliminado")
              .addFields(
                { name: "Usuario", value: `${member.user.tag}`, inline: true },
                { name: "Warn #", value: `${removed.number}`, inline: true },
                { name: "Razón original", value: removed.reason },
              )
              .setTimestamp()
          ]
        });

        await sendLog(msg.guild, logEmbed, files);
        return;
      }

      // Sin ID — muestra select
      const select = new StringSelectMenuBuilder()
        .setCustomId("unwarn_select")
        .setPlaceholder("Selecciona el warn a eliminar")
        .addOptions(
          warns.map((w) => ({
            label: `Warn #${w.number}`,
            description: w.reason.slice(0, 50),
            value: w.id,
          }))
        );

      const embedMsg = await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle(`🗑️ Eliminar warn de ${member.user.tag}`)
            .setDescription("Selecciona el warn que deseas eliminar.")
            .setThumbnail(member.user.displayAvatarURL())
        ],
        components: [new ActionRowBuilder().addComponents(select)],
        fetchReply: true,
      });

      const collector = embedMsg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000,
        filter: (i) => i.customId === "unwarn_select" && i.user.id === msg.author.id,
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        collector.stop();

        const warnId = i.values[0];
        const removed = removeWarn(member.id, warnId);
        if (!removed) return;

        const files = removed.images
          .filter((p) => fs.existsSync(p))
          .map((p) => new AttachmentBuilder(p));

        const logEmbed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🗑️ Unwarn — Log")
          .addFields(
            { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
            { name: "Eliminado por", value: `${msg.author.tag}`, inline: true },
            { name: "Warn #", value: `${removed.number}`, inline: true },
            { name: "Razón original", value: removed.reason },
            { name: "Imágenes de prueba", value: files.length ? `${files.length} imagen(es) adjunta(s)` : "Ninguna", inline: true },
          )
          .setTimestamp();

        if (files.length) logEmbed.setImage(`attachment://${path.basename(removed.images[0])}`);

        await embedMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ecc71)
              .setTitle("✅ Warn Eliminado")
              .addFields(
                { name: "Usuario", value: `${member.user.tag}`, inline: true },
                { name: "Warn #", value: `${removed.number}`, inline: true },
                { name: "Razón original", value: removed.reason },
              )
              .setTimestamp()
          ],
          components: [],
          files,
        });

        await sendLog(msg.guild, logEmbed, files);
      });

    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  }
};