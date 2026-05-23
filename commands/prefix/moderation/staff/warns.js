// commands/prefix/moderation/warns.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { errorEmbed, hasModRole } = require("../../../../utils/mod");
const { resolveMember } = require("../../../../utils/mod");
const { getWarns } = require("../../../../utils/warns");
const path = require("path");
const fs = require("fs");

const SENIOR_MOD_ROLE = "1309303527817875477";

function hasSeniorRole(member) {
  return member.roles.cache.some(
    (r) => r.position >= member.guild.roles.cache.get(SENIOR_MOD_ROLE)?.position
  );
}

// Guarda el collector activo por mensaje para poder pararlo
const activeCollectors = new Map();

function stopCollector(msgId) {
  if (activeCollectors.has(msgId)) {
    activeCollectors.get(msgId).stop("replaced");
    activeCollectors.delete(msgId);
  }
}

async function showWarnList(authorId, member, embedMsg, guildMember) {
  stopCollector(embedMsg.id);

  const warns = getWarns(member.id);

  if (!warns.length) {
    await embedMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle(`✅ ${member.user.tag} no tiene warns`)
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp()
      ],
      components: [],
      files: [],
    });
    return;
  }

  const listEmbed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`⚠️ Warns de ${member.user.tag}`)
    .setThumbnail(member.user.displayAvatarURL())
    .setDescription(`Total: **${warns.length} warn(s)**`)
    .addFields(
      warns.map((w) => ({
        name: `Warn #${w.number} — por <@${w.moderatorId}> — <t:${Math.floor(w.date / 1000)}:d>`,
        value: w.reason,
      }))
    )
    .setTimestamp();

  const selectWarn = new StringSelectMenuBuilder()
    .setCustomId("warn_select")
    .setPlaceholder("Selecciona un warn para ver detalles")
    .addOptions(
      warns.map((w) => ({
        label: `Warn #${w.number}`,
        description: w.reason.slice(0, 50),
        value: w.id,
      }))
    );

  await embedMsg.edit({
    embeds: [listEmbed],
    components: [new ActionRowBuilder().addComponents(selectWarn)],
    files: [],
  });

  const collector = embedMsg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 120_000,
    filter: (i) => i.customId === "warn_select" && i.user.id === authorId,
  });

  activeCollectors.set(embedMsg.id, collector);

  collector.on("collect", async (i) => {
    try {
      await i.deferUpdate();
      stopCollector(embedMsg.id); // para este collector antes de ir al detalle
      const warnId = i.values[0];
      const warn = warns.find((w) => w.id === warnId);
      if (!warn) return;
      await showWarnDetail(authorId, member, warn, embedMsg, guildMember);
    } catch (err) {
      if (err.code !== 40060) console.error("[Warns]", err.message);
    }
  });
}

async function showWarnDetail(authorId, member, warn, embedMsg, moderatorMember) {
  stopCollector(embedMsg.id);

  // Recarga el warn fresco del JSON por si fue editado
  const freshWarns = getWarns(member.id);
  const freshWarn = freshWarns.find((w) => w.id === warn.id) ?? warn;

  const detailEmbed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`⚠️ Warn #${freshWarn.number} — ${member.user.tag}`)
    .addFields(
      { name: "Usuario", value: `${member.user.tag}`, inline: true },
      { name: "ID", value: `\`${member.user.id}\``, inline: true },
      { name: "Moderador", value: `<@${freshWarn.moderatorId}>`, inline: true },
      { name: "Fecha", value: `<t:${Math.floor(freshWarn.date / 1000)}:F>`, inline: true },
      { name: "Imágenes", value: freshWarn.images.length ? `${freshWarn.images.length} imagen(es)` : "Ninguna", inline: true },
      { name: "Razón", value: freshWarn.reason },
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  const files = freshWarn.images
    .filter((p) => fs.existsSync(p))
    .map((p) => new AttachmentBuilder(p));

  if (files.length) detailEmbed.setImage(`attachment://${path.basename(freshWarn.images[0])}`);

  const buttons = [
    new ButtonBuilder()
      .setCustomId("warn_back")
      .setLabel("← Volver")
      .setStyle(ButtonStyle.Secondary),
  ];

  if (hasSeniorRole(moderatorMember)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("warn_edit")
        .setLabel("✏️ Editar")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("warn_delete")
        .setLabel("🗑️ Eliminar")
        .setStyle(ButtonStyle.Danger),
    );
  }

  await embedMsg.edit({
    embeds: [detailEmbed],
    files,
    components: [new ActionRowBuilder().addComponents(buttons)],
  });

  const collector = embedMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === authorId,
  });

  activeCollectors.set(embedMsg.id, collector);

  collector.on("collect", async (i) => {
    try {
      await i.deferUpdate();
      stopCollector(embedMsg.id);

      if (i.customId === "warn_back") {
        await showWarnList(authorId, member, embedMsg, moderatorMember);
      }

      if (i.customId === "warn_delete") {
        const { removeWarn } = require("../../../../utils/warns");
        const removed = removeWarn(member.id, freshWarn.id);
        if (!removed) return;

        const { sendLog } = require("../../../../utils/mod");
        await sendLog(i.guild, new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🗑️ Warn Eliminado — Log")
          .addFields(
            { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
            { name: "Eliminado por", value: `${moderatorMember.user.tag}`, inline: true },
            { name: "Warn #", value: `${removed.number}`, inline: true },
            { name: "Razón original", value: removed.reason },
          )
          .setTimestamp()
        );

        await showWarnList(authorId, member, embedMsg, moderatorMember);
      }

      if (i.customId === "warn_edit") {
        await embedMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("✏️ Editar Warn")
              .setDescription("Responde con la nueva razón.\nSi quieres cambiar imágenes, adjúntalas en el mismo mensaje.\nEscribe `cancelar` para cancelar.")
          ],
          components: [],
          files: [],
        });

        const replyCollector = embedMsg.channel.createMessageCollector({
          filter: (m) => m.author.id === authorId,
          time: 60_000,
          max: 1,
        });

        replyCollector.on("collect", async (reply) => {
          await reply.delete().catch(() => {});

          if (reply.content.toLowerCase() === "cancelar") {
            await showWarnDetail(authorId, member, freshWarn, embedMsg, moderatorMember);
            return;
          }

          const newReason = reply.content;
          const newAttachments = [...reply.attachments.values()].filter((a) =>
            a.contentType?.startsWith("image/")
          );

          const { saveImage, editWarn } = require("../../../../utils/warns");
          const newImages = [];
          for (let idx = 0; idx < newAttachments.length; idx++) {
            const p = await saveImage(newAttachments[idx], freshWarn.id, idx);
            newImages.push(p);
          }

          const result = editWarn(member.id, freshWarn.id, {
            reason: newReason,
            images: newAttachments.length ? newImages : undefined,
          });

          if (!result) return;

          const { sendLog } = require("../../../../utils/mod");
          await sendLog(i.guild, new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("✏️ Warn Editado — Log")
            .addFields(
              { name: "Usuario", value: `${member.user.tag} (\`${member.user.id}\`)`, inline: true },
              { name: "Editado por", value: `${moderatorMember.user.tag}`, inline: true },
              { name: "Warn #", value: `${result.updated.number}`, inline: true },
              { name: "Razón anterior", value: result.old.reason },
              { name: "Razón nueva", value: newReason },
              { name: "Imágenes", value: newAttachments.length ? `${newAttachments.length} nueva(s)` : "Sin cambios", inline: true },
            )
            .setTimestamp()
          );

          await showWarnDetail(authorId, member, result.updated, embedMsg, moderatorMember);
        });

        replyCollector.on("end", (_, reason) => {
          if (reason === "time") showWarnDetail(authorId, member, freshWarn, embedMsg, moderatorMember);
        });
      }
    } catch (err) {
      if (err.code !== 40060) console.error("[Warns]", err.message);
    }
  });
}

module.exports = {
  name: "warns",
  description: "Muestra los warns de un usuario",
  async execute(msg, args) {
    if (!hasModRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    if (args[0]) {
      const member = await resolveMember(msg.guild, args[0]);
      if (!member) return msg.reply({ embeds: [errorEmbed("No encontré ese usuario.")] });

      const embedMsg = await msg.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("⏳ Cargando warns...")],
        fetchReply: true,
      });

      await showWarnList(msg.author.id, member, embedMsg, msg.member);
      return;
    }

    const userSelect = new UserSelectMenuBuilder()
      .setCustomId("warns_user_select")
      .setPlaceholder("Selecciona un usuario");

    const embedMsg = await msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("⚠️ Sistema de Warns")
          .setDescription("Selecciona un usuario para ver sus warns.")
      ],
      components: [new ActionRowBuilder().addComponents(userSelect)],
      fetchReply: true,
    });

    const collector = embedMsg.createMessageComponentCollector({
      componentType: ComponentType.UserSelect,
      time: 60_000,
      filter: (i) => i.customId === "warns_user_select" && i.user.id === msg.author.id,
    });

    activeCollectors.set(embedMsg.id, collector);

    collector.on("collect", async (i) => {
      try {
        await i.deferUpdate();
        stopCollector(embedMsg.id);
        const userId = i.values[0];
        const member = await msg.guild.members.fetch(userId).catch(() => null);
        if (!member) return;
        await showWarnList(msg.author.id, member, embedMsg, msg.member);
      } catch (err) {
        if (err.code !== 40060) console.error("[Warns]", err.message);
      }
    });
  }
};