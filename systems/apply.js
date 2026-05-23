// systems/apply.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType,
} = require("discord.js");
const {
  isOpen, getQuestions, getApplicant, setApplicant, canApply,
} = require("../utils/apply");
const { getConfig: getTicketConfig, nextCounter } = require("../utils/tickets");
const { STAFF_ROLE_ID, OWNERS } = require("../config");

const APPLY_LOG_CHANNEL  = "1502546793597239336";
const APPLY_CATEGORY_ID  = "1310315930248548483"; // misma categoria q tickets
const STAFF_ROLES        = ["1309303771087638590", "1309303269268521002", "1309303353720967239"];
const STAFF_ZONE_ROLE    = "1309303771087638590";

// Sesiones activas en memoria: channelId → { userId, answers, currentQ, collector, timeout }
const activeSessions = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────
function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

async function sendApplyLog(guild, embed, components = []) {
  const ch = guild.channels.cache.get(APPLY_LOG_CHANNEL);
  if (ch) await ch.send({ embeds: [embed], components }).catch(() => {});
  return ch;
}

// ── Crear canal de apply ───────────────────────────────────────────────────
async function createApplyChannel(guild, userId) {
  const member   = await guild.members.fetch(userId).catch(() => null);
  const username = member?.user.username ?? userId;
  const number   = nextCounter();

  const channel = await guild.channels.create({
    name: `apply-${username}`,
    type: ChannelType.GuildText,
    parent: APPLY_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages], deny: [PermissionsBitField.Flags.SendMessages] },
    ],
  });

  setApplicant(userId, { status: "pending", channelId: channel.id, appliedAt: Date.now() });

  // Embed de bienvenida con botón START
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Postulación a Staff — CoreCM")
    .setDescription(
      `Hola <@${userId}>, bienvenido al proceso de postulación.\n\n` +
      `Se te harán **${getQuestions().length} preguntas** y cada una tendrá un tiempo límite para responder.\n` +
      `Si no respondés a tiempo o escribís \`skip\`, se pasará a la siguiente.\n\n` +
      `⚠️ **Una vez iniciado no podés reiniciar el proceso.**\n\n` +
      `Cuando estés listo, presioná el botón de abajo.`
    )
    .setFooter({ text: "CoreCM — Postulaciones" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`apply_start:${userId}`)
      .setLabel("🚀 Iniciar postulación")
      .setStyle(ButtonStyle.Success),
  );

  const startMsg = await channel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });
  setApplicant(userId, { startMessageId: startMsg.id });

  return channel;
}

// ── Iniciar preguntas ──────────────────────────────────────────────────────
async function startApply(channel, userId, guild) {
  const questions = getQuestions();
  if (!questions.length) {
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ No hay preguntas configuradas. Contactá a un administrador.")],
    });
    return;
  }

  // Bloquea el botón START
  const applicant = getApplicant(userId);
  if (applicant?.startMessageId) {
    const startMsg = await channel.messages.fetch(applicant.startMessageId).catch(() => null);
    if (startMsg) {
      await startMsg.edit({
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`apply_start:${userId}`).setLabel("🚀 Postulación iniciada").setStyle(ButtonStyle.Success).setDisabled(true),
        )],
      }).catch(() => {});
    }
  }

  setApplicant(userId, { started: true, answers: [] });

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ ¡Postulación iniciada!")
      .setDescription("Las preguntas comenzarán en **3 segundos**. Respondé en el chat, escribí `skip` para saltear.")
      .setTimestamp()],
  });

  setTimeout(() => askQuestion(channel, userId, guild, 0, []), 3000);
}

// ── Preguntar ──────────────────────────────────────────────────────────────
async function askQuestion(channel, userId, guild, index, answers) {
  const questions = getQuestions();

  if (index >= questions.length) {
    await finishApply(channel, userId, guild, answers);
    return;
  }

  const q = questions[index];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Pregunta ${index + 1} / ${questions.length}`)
    .setDescription(`**${q.text}**`)
    .setFooter({ text: `⏱️ Tiempo límite: ${formatMs(q.timeMs)} • Escribí "skip" para saltear` })
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  // Collector de mensajes
  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === userId,
    time: q.timeMs,
    max: 1,
  });

  // Timeout visual
  const timeoutMsg = setTimeout(async () => {
    const remaining = Math.ceil(q.timeMs / 1000);
  }, 0);

  activeSessions.set(channel.id, { userId, currentQ: index, collector });

  collector.on("collect", async (msg) => {
    await msg.delete().catch(() => {});
    const answer = msg.content.trim().toLowerCase() === "skip" ? "*Sin respuesta*" : msg.content.trim();
    answers.push({ question: q.text, answer });

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`✅ Respuesta registrada.`)],
    }).then((m) => setTimeout(() => m.delete().catch(() => {}), 2000));

    askQuestion(channel, userId, guild, index + 1, answers);
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      // Tiempo agotado
      answers.push({ question: q.text, answer: "*Sin respuesta (tiempo agotado)*" });
      channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xf39c12)
          .setDescription(`⏱️ Tiempo agotado. Pasando a la siguiente pregunta...`)],
      }).then((m) => setTimeout(() => m.delete().catch(() => {}), 2500));
      askQuestion(channel, userId, guild, index + 1, answers);
    }
  });
}

// ── Finalizar postulación ──────────────────────────────────────────────────
async function finishApply(channel, userId, guild, answers) {
  activeSessions.delete(channel.id);

  const member = await guild.members.fetch(userId).catch(() => null);

  // Bloquea el canal — nadie puede escribir más
  await channel.permissionOverwrites.edit(userId, { SendMessages: false }).catch(() => {});

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Postulación completada")
      .setDescription("Tu postulación fue enviada al equipo de CoreCM.\nRecibirás una respuesta por DM. ¡Gracias por postularte! 🎉")
      .setTimestamp()],
  });

  // Arma el embed del formulario para el canal de logs
  const answersText = answers.map((a, i) =>
    `**${i + 1}. ${a.question}**\n${a.answer}`
  ).join("\n\n");

  const formEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Nueva Postulación — ${member?.user.tag ?? userId}`)
    .setThumbnail(member?.user.displayAvatarURL() ?? null)
    .setDescription(answersText.length > 4000 ? answersText.slice(0, 4000) + "..." : answersText)
    .addFields(
      { name: "Usuario", value: `<@${userId}> (\`${userId}\`)`, inline: true },
      { name: "Canal", value: `<#${channel.id}>`, inline: true },
      { name: "Fecha", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: "CoreCM — Postulaciones" })
    .setTimestamp();

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`apply_accept:${userId}`).setLabel("✅ Aceptar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`apply_reject:${userId}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger),
  );

  const logCh = guild.channels.cache.get(APPLY_LOG_CHANNEL);
  if (logCh) {
    const formMsg = await logCh.send({ embeds: [formEmbed], components: [actionRow] });
    setApplicant(userId, { formMessageId: formMsg.id, answers, status: "pending" });
  }
}

// ── Aceptar / Rechazar ─────────────────────────────────────────────────────
async function handleAccept(interaction) {
  const userId = interaction.customId.split(":")[1];

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`apply_accept_modal:${userId}`)
      .setTitle("✅ Aceptar postulación")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("score")
            .setLabel("Puntaje obtenido (ej: 8/10)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("comment")
            .setLabel("Comentario para el postulante")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
      )
  );
}

async function handleReject(interaction) {
  const userId = interaction.customId.split(":")[1];

  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`apply_reject_modal:${userId}`)
      .setTitle("❌ Rechazar postulación")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("score")
            .setLabel("Puntaje obtenido (ej: 4/10)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("comment")
            .setLabel("Motivo del rechazo")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
      )
  );
}

async function handleAcceptModal(interaction, guild) {
  const userId  = interaction.customId.split(":")[1];
  const score   = interaction.fields.getTextInputValue("score");
  const comment = interaction.fields.getTextInputValue("comment");

  await interaction.deferReply({ ephemeral: true });

  const member = await guild.members.fetch(userId).catch(() => null);

  // Agrega roles de staff
  if (member) {
    for (const roleId of STAFF_ROLES) {
      await member.roles.add(roleId).catch(() => {});
    }
  }

  setApplicant(userId, { status: "accepted" });

  // Edita el embed del formulario — deshabilita botones
  await disableFormButtons(interaction.message);

  // Log
  await interaction.message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Postulación Aceptada")
      .addFields(
        { name: "Postulante", value: `<@${userId}>`, inline: true },
        { name: "Revisado por", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Puntaje", value: score, inline: true },
        { name: "Comentario", value: comment },
      )
      .setTimestamp()],
  });

  // DM al postulante
  if (member) {
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("🎉 ¡Felicitaciones! Tu postulación fue aceptada")
        .setDescription(
          `El equipo de **CoreCM** ha revisado tu postulación y has sido **aceptado/a**.\n\n` +
          `¡Bienvenido/a al staff! Nos alegra tenerte con nosotros. 💙`
        )
        .addFields(
          { name: "Puntaje obtenido", value: score, inline: true },
          { name: "Revisado por", value: interaction.user.tag, inline: true },
          { name: "Comentario del staff", value: comment },
        )
        .setFooter({ text: "CoreCM — Postulaciones" })
        .setTimestamp()],
    }).catch(() => {});
  }

  // Cierra el canal de apply
  const applicant = getApplicant(userId);
  if (applicant?.channelId) {
    const applyCh = guild.channels.cache.get(applicant.channelId);
    if (applyCh) {
      await applyCh.send({
        embeds: [new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("✅ Postulación aceptada")
          .setDescription("¡Felicitaciones! Este canal se cerrará en 10 segundos.")
          .setTimestamp()],
      });
      setTimeout(() => applyCh.delete("Apply aceptado").catch(() => {}), 10_000);
    }
  }

  await interaction.editReply({ content: "✅ Postulante aceptado." });
}

async function handleRejectModal(interaction, guild) {
  const userId  = interaction.customId.split(":")[1];
  const score   = interaction.fields.getTextInputValue("score");
  const comment = interaction.fields.getTextInputValue("comment");

  await interaction.deferReply({ ephemeral: true });

  const member = await guild.members.fetch(userId).catch(() => null);

  setApplicant(userId, { status: "rejected" });

  await disableFormButtons(interaction.message);

  // Log
  await interaction.message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("❌ Postulación Rechazada")
      .addFields(
        { name: "Postulante", value: `<@${userId}>`, inline: true },
        { name: "Revisado por", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Puntaje", value: score, inline: true },
        { name: "Motivo", value: comment },
      )
      .setTimestamp()],
  });

  // DM al postulante
  if (member) {
    await member.send({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Tu postulación fue revisada")
        .setDescription(
          `El equipo de **CoreCM** ha revisado tu postulación.\n\n` +
          `Lamentablemente en esta ocasión no fue posible aceptarte, pero podés volver a intentarlo cuando se abran nuevas postulaciones. 💙`
        )
        .addFields(
          { name: "Puntaje obtenido", value: score, inline: true },
          { name: "Revisado por", value: interaction.user.tag, inline: true },
          { name: "Motivo", value: comment },
        )
        .setFooter({ text: "CoreCM — Postulaciones" })
        .setTimestamp()],
    }).catch(() => {});
  }

  // Cierra canal
  const applicant = getApplicant(userId);
  if (applicant?.channelId) {
    const applyCh = guild.channels.cache.get(applicant.channelId);
    if (applyCh) {
      await applyCh.send({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("❌ Postulación rechazada")
          .setDescription("Gracias por postularte. Este canal se cerrará en 10 segundos.")
          .setTimestamp()],
      });
      setTimeout(() => applyCh.delete("Apply rechazado").catch(() => {}), 10_000);
    }
  }

  await interaction.editReply({ content: "✅ Postulante rechazado." });
}

async function disableFormButtons(message) {
  if (!message) return;
  await message.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("apply_accept_done").setLabel("✅ Aceptado").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("apply_reject_done").setLabel("❌ Rechazado").setStyle(ButtonStyle.Danger).setDisabled(true),
    )],
  }).catch(() => {});
}

// ── Setup ──────────────────────────────────────────────────────────────────
function setupApply(client) {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    const { customId, guild } = interaction;

    // START
    if (interaction.isButton() && customId.startsWith("apply_start:")) {
      const userId = customId.split(":")[1];
      if (interaction.user.id !== userId)
        return interaction.reply({ content: "❌ Esta postulación no es tuya.", ephemeral: true });

      const applicant = getApplicant(userId);
      if (applicant?.started)
        return interaction.reply({ content: "❌ Ya iniciaste tu postulación.", ephemeral: true });

      await interaction.deferUpdate();
      await startApply(interaction.channel, userId, guild);
      return;
    }

    // ACEPTAR / RECHAZAR (botones)
    if (interaction.isButton() && customId.startsWith("apply_accept:")) {
      if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !OWNERS.includes(interaction.user.id))
        return interaction.reply({ content: "❌ Sin permisos.", ephemeral: true });
      await handleAccept(interaction);
      return;
    }

    if (interaction.isButton() && customId.startsWith("apply_reject:")) {
      if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !OWNERS.includes(interaction.user.id))
        return interaction.reply({ content: "❌ Sin permisos.", ephemeral: true });
      await handleReject(interaction);
      return;
    }

    // MODALES
    if (interaction.isModalSubmit() && customId.startsWith("apply_accept_modal:")) {
      await handleAcceptModal(interaction, guild);
      return;
    }

    if (interaction.isModalSubmit() && customId.startsWith("apply_reject_modal:")) {
      await handleRejectModal(interaction, guild);
      return;
    }
  });

  console.log("[Apply] Sistema iniciado.");
}

module.exports = { setupApply, createApplyChannel };