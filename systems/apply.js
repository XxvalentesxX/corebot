// systems/apply.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType,
} = require("discord.js");
const {
  isOpen, getApplicant, setApplicant, canApply,
  selectCategoryQuestions, getGeneralQuestions, getCategoryQuestions,
} = require("../utils/apply");
const { STAFF_ROLE_ID, OWNERS } = require("../config");
const APPLY_CONFIG       = require("../config/apply");

const APPLY_LOG_CHANNEL = "1502546793597239336";
const APPLY_CATEGORY_ID = "1310315930248548483";
const STAFF_ROLES       = ["1309303771087638590", "1309303269268521002", "1309303353720967239"];

// Sesiones activas en memoria
// channelId → { userId, generalAnswers, categoryAnswers: {catId: [{q,a}]}, phase, collector }
const sessions = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

async function safeDelete(msg) {
  await msg.delete().catch(() => {});
}

async function tempMsg(channel, embed, delay = 2500) {
  const m = await channel.send({ embeds: [embed] });
  setTimeout(() => safeDelete(m), delay);
}

// ─────────────────────────────────────────────────────────────────────────────
// CREAR CANAL
// ─────────────────────────────────────────────────────────────────────────────
async function createApplyChannel(guild, userId) {
  const member   = await guild.members.fetch(userId).catch(() => null);
  const username = member?.user.username ?? userId;

  const channel = await guild.channels.create({
    name: `apply-${username}`,
    type: ChannelType.GuildText,
    parent: APPLY_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: userId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
        ],
        deny: [PermissionsBitField.Flags.SendMessages],
      },
    ],
  });

  setApplicant(userId, { status: "pending", channelId: channel.id, appliedAt: Date.now() });

  const totalGeneral  = getGeneralQuestions().length;
  const categoriesStr = APPLY_CONFIG.categories.map((c) => `**${c.label}**`).join(", ");

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Postulación a Staff — CoreCM")
    .setDescription(
      `Hola <@${userId}>, bienvenido al proceso de postulación.\n\n` +
      `El proceso tiene **2 etapas:**\n` +
      `**1.** ${totalGeneral} preguntas generales\n` +
      `**2.** Preguntas sobre los lenguajes que elegís (${categoriesStr})\n\n` +
      `Cada pregunta tiene su propio tiempo límite. Escribí \`skip\` para saltear.\n\n` +
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

// ─────────────────────────────────────────────────────────────────────────────
// INICIAR — deshabilita botón y arranca preguntas generales
// ─────────────────────────────────────────────────────────────────────────────
async function startApply(channel, userId, guild) {
  const applicant = getApplicant(userId);
  if (applicant?.startMessageId) {
    const startMsg = await channel.messages.fetch(applicant.startMessageId).catch(() => null);
    if (startMsg) {
      await startMsg.edit({
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`apply_start:${userId}`)
            .setLabel("🚀 Postulación iniciada")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        )],
      }).catch(() => {});
    }
  }

  setApplicant(userId, { started: true, generalAnswers: [], categoryAnswers: {} });

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ ¡Postulación iniciada!")
      .setDescription("Las preguntas comenzarán en **3 segundos**.")
      .setTimestamp()],
  });

  sessions.set(channel.id, {
    userId,
    generalAnswers:  [],
    categoryAnswers: {},
    chosenCategories: [],
    categoryQueue:   [],  // [ { catId, questions[] } ] pendientes
    phase: "general",
  });

  setTimeout(() => askGeneralQuestion(channel, userId, guild, 0), 3000);
}

// ─────────────────────────────────────────────────────────────────────────────
// PREGUNTAS GENERALES
// ─────────────────────────────────────────────────────────────────────────────
async function askGeneralQuestion(channel, userId, guild, index) {
  const questions = getGeneralQuestions();

  if (index >= questions.length) {
    // Terminaron las generales → mostrar selector de categorías
    await showCategorySelector(channel, userId, guild);
    return;
  }

  const q     = questions[index];
  const time  = q.timeMs ?? APPLY_CONFIG.DEFAULT_QUESTION_TIME_MS;
  const total = questions.length;

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📋 Preguntas Generales — ${index + 1} / ${total}`)
      .setDescription(`**${q.text}**`)
      .setFooter({ text: `⏱️ Tiempo límite: ${formatMs(time)} • Escribí "skip" para saltear` })
      .setTimestamp()],
  });

  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === userId,
    time,
    max: 1,
  });

  const sess = sessions.get(channel.id);
  if (sess) sess.collector = collector;

  collector.on("collect", async (msg) => {
    await safeDelete(msg);
    const answer = msg.content.trim().toLowerCase() === "skip" ? "*Sin respuesta*" : msg.content.trim();
    if (sess) sess.generalAnswers.push({ question: q.text, answer });

    await tempMsg(channel, new EmbedBuilder().setColor(0x57f287).setDescription("✅ Respuesta registrada."));
    askGeneralQuestion(channel, userId, guild, index + 1);
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      if (sess) sess.generalAnswers.push({ question: q.text, answer: "*Sin respuesta (tiempo agotado)*" });
      tempMsg(channel, new EmbedBuilder().setColor(0xfee75c).setDescription("⏱️ Tiempo agotado. Pasando a la siguiente pregunta..."));
      askGeneralQuestion(channel, userId, guild, index + 1);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE CATEGORÍAS (botones)
// ─────────────────────────────────────────────────────────────────────────────
async function showCategorySelector(channel, userId, guild) {
  const config     = APPLY_CONFIG;
  const categories = config.categories;
  const time       = config.CATEGORY_SELECT_TIME_MS;

  // Construye hasta 5 botones por fila (máx 5 por ActionRow)
  const buttons = categories.map((cat) =>
    new ButtonBuilder()
      .setCustomId(`apply_cat:${cat.id}`)
      .setLabel(cat.label)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔧 ¿Qué lenguajes o áreas manejás?")
    .setDescription(
      `Elegí **uno o más** de los siguientes. Podés hacer click en varios.\n\n` +
      `Cuando termines de elegir, presioná **✅ Listo**.\n\n` +
      `⏱️ Tenés **${formatMs(time)}** para elegir.`
    )
    .setFooter({ text: "Podés elegir más de uno" })
    .setTimestamp();

  // Botón de confirmación en fila aparte
  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`apply_cat_confirm:${userId}`)
      .setLabel("✅ Listo")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true), // se activa al elegir al menos uno
  );

  const selectorMsg = await channel.send({
    embeds: [embed],
    components: [...rows, confirmRow],
  });

  // Estado local de selección
  const selected = new Set();

  const collector = channel.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && (i.customId.startsWith("apply_cat:") || i.customId.startsWith("apply_cat_confirm:")),
    time,
  });

  collector.on("collect", async (interaction) => {
    // Toggle de categoría
    if (interaction.customId.startsWith("apply_cat:")) {
      const catId = interaction.customId.split(":")[1];

      if (selected.has(catId)) {
        selected.delete(catId);
      } else {
        selected.add(catId);
      }

      // Actualiza botones — verde si seleccionado
      const updatedButtons = categories.map((cat) =>
        new ButtonBuilder()
          .setCustomId(`apply_cat:${cat.id}`)
          .setLabel(cat.label)
          .setStyle(selected.has(cat.id) ? ButtonStyle.Success : ButtonStyle.Primary)
      );

      const updatedRows = [];
      for (let i = 0; i < updatedButtons.length; i += 5)
        updatedRows.push(new ActionRowBuilder().addComponents(updatedButtons.slice(i, i + 5)));

      const updatedConfirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`apply_cat_confirm:${userId}`)
          .setLabel("✅ Listo")
          .setStyle(ButtonStyle.Success)
          .setDisabled(selected.size === 0),
      );

      await interaction.update({ components: [...updatedRows, updatedConfirm] });
      return;
    }

    // Confirmar selección
    if (interaction.customId.startsWith("apply_cat_confirm:")) {
      if (selected.size === 0) {
        await interaction.reply({ content: "❌ Tenés que elegir al menos una opción.", ephemeral: true });
        return;
      }

      collector.stop("confirmed");

      // Deshabilita todos los botones
      await selectorMsg.edit({ components: [] }).catch(() => {});
      await interaction.deferUpdate().catch(() => {});

      const chosenIds  = [...selected];
      const questionMap = selectCategoryQuestions(chosenIds, APPLY_CONFIG);

      const sess = sessions.get(channel.id);
      if (sess) {
        sess.chosenCategories = chosenIds;
        sess.categoryQueue    = chosenIds.map((id) => ({
          catId:     id,
          questions: questionMap[id] ?? [],
        }));
        sess.phase = "category";
      }

      const selectedLabels = chosenIds
        .map((id) => categories.find((c) => c.id === id)?.label ?? id)
        .join(", ");

      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Selección registrada")
          .setDescription(`Elegiste: **${selectedLabels}**\n\nAhora vienen las preguntas específicas. ¡Éxitos!`)
          .setTimestamp()],
      });

      setTimeout(() => askCategoryQuestion(channel, userId, guild), 2000);
    }
  });

  collector.on("end", (_, reason) => {
    if (reason !== "confirmed") {
      // Tiempo agotado sin confirmar — avanza con lo que eligió o sin nada
      selectorMsg.edit({ components: [] }).catch(() => {});

      const chosenIds   = selected.size > 0 ? [...selected] : [];
      const questionMap = chosenIds.length ? selectCategoryQuestions(chosenIds, APPLY_CONFIG) : {};

      const sess = sessions.get(channel.id);
      if (sess) {
        sess.chosenCategories = chosenIds;
        sess.categoryQueue    = chosenIds.map((id) => ({
          catId:     id,
          questions: questionMap[id] ?? [],
        }));
        sess.phase = "category";
      }

      if (chosenIds.length === 0) {
        // No eligió nada → terminar directo
        channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setDescription("⏱️ Tiempo agotado en la selección. Se enviará la postulación con solo las preguntas generales.")
            .setTimestamp()],
        });
        setTimeout(() => finishApply(channel, userId, guild), 2000);
      } else {
        channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xfee75c)
            .setDescription("⏱️ Tiempo agotado. Continuando con la selección actual...")
            .setTimestamp()],
        });
        setTimeout(() => askCategoryQuestion(channel, userId, guild), 2000);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PREGUNTAS DE CATEGORÍA
// ─────────────────────────────────────────────────────────────────────────────
async function askCategoryQuestion(channel, userId, guild) {
  const sess = sessions.get(channel.id);
  if (!sess) return;

  // Busca la categoría actual con preguntas restantes
  while (sess.categoryQueue.length > 0 && sess.categoryQueue[0].questions.length === 0) {
    sess.categoryQueue.shift();
  }

  if (sess.categoryQueue.length === 0) {
    await finishApply(channel, userId, guild);
    return;
  }

  const current    = sess.categoryQueue[0];
  const catConfig  = APPLY_CONFIG.categories.find((c) => c.id === current.catId);
  const q          = current.questions.shift(); // saca la primera
  const time       = q.timeMs ?? APPLY_CONFIG.DEFAULT_QUESTION_TIME_MS;

  // Cuántas quedan en total
  const totalLeft  = sess.categoryQueue.reduce((acc, c) => acc + c.questions.length, 0) + 1;

  if (!sess.categoryAnswers[current.catId]) sess.categoryAnswers[current.catId] = [];

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x7b2fbe)
      .setTitle(`${catConfig?.embedTitle ?? current.catId} — Pregunta (${totalLeft} restantes)`)
      .setDescription(`**${q.text}**`)
      .setFooter({ text: `⏱️ Tiempo límite: ${formatMs(time)} • Escribí "skip" para saltear` })
      .setTimestamp()],
  });

  const collector = channel.createMessageCollector({
    filter: (m) => m.author.id === userId,
    time,
    max: 1,
  });

  sess.collector = collector;

  collector.on("collect", async (msg) => {
    await safeDelete(msg);
    const answer = msg.content.trim().toLowerCase() === "skip" ? "*Sin respuesta*" : msg.content.trim();
    sess.categoryAnswers[current.catId].push({ question: q.text, answer });

    await tempMsg(channel, new EmbedBuilder().setColor(0x57f287).setDescription("✅ Respuesta registrada."));
    askCategoryQuestion(channel, userId, guild);
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      sess.categoryAnswers[current.catId].push({ question: q.text, answer: "*Sin respuesta (tiempo agotado)*" });
      tempMsg(channel, new EmbedBuilder().setColor(0xfee75c).setDescription("⏱️ Tiempo agotado. Pasando a la siguiente pregunta..."));
      askCategoryQuestion(channel, userId, guild);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZAR — arma embeds y envía al canal de logs
// ─────────────────────────────────────────────────────────────────────────────
async function finishApply(channel, userId, guild) {
  const sess   = sessions.get(channel.id);
  sessions.delete(channel.id);

  await channel.permissionOverwrites.edit(userId, { SendMessages: false }).catch(() => {});

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Postulación completada")
      .setDescription("Tu postulación fue enviada al equipo de CoreCM.\nRecibirás una respuesta por DM. ¡Gracias por postularte! 🎉")
      .setTimestamp()],
  });

  const member     = await guild.members.fetch(userId).catch(() => null);
  const logChannel = guild.channels.cache.get(APPLY_LOG_CHANNEL);
  if (!logChannel) return;

  // ── EMBED 1 — Preguntas Generales ─────────────────────────────────────────
  const generalText = (sess?.generalAnswers ?? [])
    .map((a, i) => `**${i + 1}. ${a.question}**\n${a.answer}`)
    .join("\n\n");

  const embed1 = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Postulación — ${member?.user.tag ?? userId}`)
    .setThumbnail(member?.user.displayAvatarURL() ?? null)
    .addFields(
      { name: "Usuario", value: `<@${userId}> (\`${userId}\`)`,              inline: true },
      { name: "Canal",   value: `<#${channel.id}>`,                           inline: true },
      { name: "Fecha",   value: `<t:${Math.floor(Date.now() / 1000)}:F>`,     inline: true },
    )
    .setFooter({ text: "CoreCM — Postulaciones" })
    .setTimestamp();

  // ── EMBEDS de categorías elegidas ─────────────────────────────────────────
  const categoryEmbeds = [];
  const chosenIds      = sess?.chosenCategories ?? [];

  for (const catId of chosenIds) {
    const catConfig = APPLY_CONFIG.categories.find((c) => c.id === catId);
    const answers   = sess?.categoryAnswers?.[catId] ?? [];
    if (!answers.length) continue;

    const text = answers
      .map((a, i) => `**${i + 1}. ${a.question}**\n${a.answer}`)
      .join("\n\n");

    categoryEmbeds.push(
      new EmbedBuilder()
        .setColor(0x7b2fbe)
        .setTitle(`${catConfig?.embedTitle ?? catId}`)
        .setDescription(text.length > 4000 ? text.slice(0, 4000) + "..." : text)
        .setTimestamp()
    );
  }

  // Añade el texto general al embed1
  embed1.setDescription(
    generalText.length > 4000 ? generalText.slice(0, 4000) + "..." : generalText || "*Sin respuestas generales*"
  );

  // Botones de acción
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`apply_accept:${userId}`).setLabel("✅ Aceptar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`apply_reject:${userId}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger),
  );

  // Discord permite hasta 10 embeds por mensaje
  // Si hay muchos, enviamos en varios mensajes
  const allEmbeds = [embed1, ...categoryEmbeds];
  const chunks    = [];
  for (let i = 0; i < allEmbeds.length; i += 10) chunks.push(allEmbeds.slice(i, i + 10));

  let formMsg;
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    formMsg = await logChannel.send({
      embeds:     chunks[i],
      components: isLast ? [actionRow] : [],
    });
  }

  setApplicant(userId, {
    formMessageId:   formMsg?.id,
    generalAnswers:  sess?.generalAnswers ?? [],
    categoryAnswers: sess?.categoryAnswers ?? {},
    status:          "pending",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ACEPTAR / RECHAZAR
// ─────────────────────────────────────────────────────────────────────────────
async function disableFormButtons(message) {
  await message.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("apply_accept_done").setLabel("✅ Aceptado").setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId("apply_reject_done").setLabel("❌ Rechazado").setStyle(ButtonStyle.Danger).setDisabled(true),
    )],
  }).catch(() => {});
}

async function handleAccept(interaction) {
  const userId = interaction.customId.split(":")[1];
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`apply_accept_modal:${userId}`)
      .setTitle("✅ Aceptar postulación")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("score").setLabel("Puntaje obtenido (ej: 8/10)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("comment").setLabel("Comentario para el postulante").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
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
          new TextInputBuilder().setCustomId("score").setLabel("Puntaje obtenido (ej: 4/10)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("comment").setLabel("Motivo del rechazo").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
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

  if (member) {
    for (const roleId of STAFF_ROLES)
      await member.roles.add(roleId).catch(() => {});
  }

  setApplicant(userId, { status: "accepted" });
  await disableFormButtons(interaction.message);

  await interaction.message.channel.send({
    embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Postulación Aceptada")
      .addFields(
        { name: "Postulante",   value: `<@${userId}>`,                  inline: true },
        { name: "Revisado por", value: `<@${interaction.user.id}>`,     inline: true },
        { name: "Puntaje",      value: score,                           inline: true },
        { name: "Comentario",   value: comment },
      ).setTimestamp()],
  });

  if (member) {
    await member.send({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🎉 ¡Tu postulación fue aceptada!")
        .setDescription(`El equipo de **CoreCM** revisó tu postulación y fuiste **aceptado/a**. ¡Bienvenido/a al staff! 💙`)
        .addFields(
          { name: "Puntaje",            value: score,                     inline: true },
          { name: "Revisado por",       value: interaction.user.tag,      inline: true },
          { name: "Comentario",         value: comment },
        ).setFooter({ text: "CoreCM — Postulaciones" }).setTimestamp()],
    }).catch(() => {});
  }

  const applicant = getApplicant(userId);
  if (applicant?.channelId) {
    const applyCh = guild.channels.cache.get(applicant.channelId);
    if (applyCh) {
      await applyCh.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Postulación aceptada").setDescription("¡Felicitaciones! Este canal se cerrará en 10 segundos.").setTimestamp()] });
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

  await interaction.message.channel.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Postulación Rechazada")
      .addFields(
        { name: "Postulante",   value: `<@${userId}>`,              inline: true },
        { name: "Revisado por", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Puntaje",      value: score,                       inline: true },
        { name: "Motivo",       value: comment },
      ).setTimestamp()],
  });

  if (member) {
    await member.send({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Tu postulación fue revisada")
        .setDescription(`Lamentablemente en esta ocasión no fue posible aceptarte. Podés volver a intentarlo cuando se abran nuevas postulaciones. 💙`)
        .addFields(
          { name: "Puntaje",      value: score,                inline: true },
          { name: "Revisado por", value: interaction.user.tag, inline: true },
          { name: "Motivo",       value: comment },
        ).setFooter({ text: "CoreCM — Postulaciones" }).setTimestamp()],
    }).catch(() => {});
  }

  const applicant = getApplicant(userId);
  if (applicant?.channelId) {
    const applyCh = guild.channels.cache.get(applicant.channelId);
    if (applyCh) {
      await applyCh.send({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Postulación rechazada").setDescription("Gracias por postularte. Este canal se cerrará en 10 segundos.").setTimestamp()] });
      setTimeout(() => applyCh.delete("Apply rechazado").catch(() => {}), 10_000);
    }
  }

  await interaction.editReply({ content: "✅ Postulante rechazado." });
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
function setupApply(client) {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;
    const { customId, guild } = interaction;

    if (interaction.isButton() && customId.startsWith("apply_start:")) {
      const userId = customId.split(":")[1];
      if (interaction.user.id !== userId)
        return interaction.reply({ content: "❌ Esta postulación no es tuya.", ephemeral: true });
      const applicant = getApplicant(userId);
      if (applicant?.started && applicant?.status === "pending")
        return interaction.reply({ content: "❌ Ya iniciaste tu postulación.", ephemeral: true });
      await interaction.deferUpdate();
      await startApply(interaction.channel, userId, guild);
      return;
    }

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