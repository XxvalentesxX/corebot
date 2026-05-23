// systems/tickets.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType,
} = require("discord.js");
const {
  getConfig, nextCounter, getTicket, getTicketByUser, getUserOpenTickets,
  createTicket, updateTicket, closeTicket, addMessage, addStat,
} = require("../utils/tickets");
const { STAFF_ROLE_ID, LOG_CHANNEL_ID } = require("../config");
const { generateTranscript } = require("../utils/transcript");

// Roles mencionados según lenguaje de soporte
const LANG_ROLES = {
  javascript:     "1309319160282611862",
  desarrollo_web: "1309319160349724733",
  python:         "1309319153647222814",
  bdfd:           "1309319154112794734",
};

// Colores por categoría
const COLORS = {
  soporte:     0x5865f2,
  recompensas: 0xf1c40f,
  apply:       0x2ecc71,
  ally:        0x1abc9c,
  report:      0xe74c3c,
};

const CATEGORY_NAMES = {
  soporte:     "🎧 Soporte",
  recompensas: "🏆 Recompensas",
  apply:       "📋 Apply",
  ally:        "🤝 Alianzas",
  report:      "🚨 Reporte",
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function sendLog(guild, embed, files = []) {
  const config = getConfig();
  const ch = guild.channels.cache.get(config.logChannelId);
  if (ch) await ch.send({ embeds: [embed], files }).catch(() => {});
}

function ticketEmbed(ticket, extra = {}) {
  const color = COLORS[ticket.category] ?? 0x5865f2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${CATEGORY_NAMES[ticket.category]} — Ticket #${ticket.number}`)
    .addFields(
      { name: "Usuario", value: `<@${ticket.userId}>`, inline: true },
      { name: "Estado", value: ticket.status === "open" ? "🟢 Abierto" : ticket.status === "locked" ? "🔒 Cerrado" : "⚫ Archivado", inline: true },
      { name: "Reclamado por", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Sin reclamar", inline: true },
      ...Object.entries(extra).map(([name, value]) => ({ name, value: String(value), inline: false })),
    )
    .setTimestamp();
  return embed;
}

function ticketButtons(locked = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("🙋 Reclamar").setStyle(ButtonStyle.Primary).setDisabled(locked),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Cerrar").setStyle(ButtonStyle.Danger).setDisabled(locked),
  );
}

async function createTicketChannel(guild, userId, category, number, extraFields = {}) {
  const config = getConfig();
  const member = await guild.members.fetch(userId).catch(() => null);
  const username = member?.user.username ?? userId;

  const channel = await guild.channels.create({
    name: `${category}-${username}-${number}`,
    type: ChannelType.GuildText,
    parent: config.categoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageMessages] },
    ],
  });

  const ticket = createTicket(channel.id, { userId, category, number, extraFields });

  const embed = ticketEmbed(ticket, extraFields);
  const row = ticketButtons();

  const ticketMsg = await channel.send({
    content: `<@${userId}> <@&${STAFF_ROLE_ID}>`,
    embeds: [embed],
    components: [row],
  });

  // Mensaje de bienvenida sin mención extra — solo nombre en negrita
  const member2 = await guild.members.fetch(userId).catch(() => null);
  await channel.send(`**${member2?.user.username ?? userId}**, tu ticket fue creado. El staff te atenderá pronto.`);

  updateTicket(channel.id, { embedMessageId: ticketMsg.id });

  return channel;
}

// ── Collectors activos (para evitar duplicados) ────────────────────────────
const activeFlows = new Set();

// ── Handler principal ──────────────────────────────────────────────────────
function setupTickets(client) {

  client.on("interactionCreate", async (interaction) => {
    // ── Botones del panel ────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, user, guild } = interaction;

      // Panel: abrir ticket por categoría
      if (customId.startsWith("open_ticket_")) {
        const category = customId.replace("open_ticket_", "");
        await handleOpenTicket(interaction, category);
        return;
      }

      // Soporte: elegir tipo (programación o dudas)
      if (customId.startsWith("soporte_tipo_")) {
        await handleSoporteTipo(interaction, customId.replace("soporte_tipo_", ""));
        return;
      }

      // Soporte programación: elegir lenguaje
      if (customId.startsWith("soporte_lang_")) {
        await handleSoporteLang(interaction, customId.replace("soporte_lang_", ""));
        return;
      }

      // Ticket: reclamar
      if (customId === "ticket_claim") {
        await handleClaim(interaction);
        return;
      }

      // Ticket: cerrar (muestra opciones valorar/cerrar directo)
      if (customId === "ticket_close") {
        await handleClosePrompt(interaction);
        return;
      }

      // Ticket: unlock (botón en embed principal cuando está locked)
      if (customId === "ticket_unlock") {
        await handleUnlock(interaction);
        return;
      }

      // Retomar desde prompt de cierre
      if (customId === "ticket_reopen_pending") {
        await handleReopenPending(interaction);
        return;
      }

      // Cierre: cerrar sin valoración
      if (customId === "ticket_close_direct") {
        await handleCloseDirect(interaction);
        return;
      }

      // Cierre: valorar y transcribir — showModal primero (no se puede update + showModal juntos)
      if (customId === "ticket_rate_close") {
        await interaction.showModal(ratingModal());
        return;
      }
    }

    // ── Modales ──────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      const { customId } = interaction;

      if (customId === "modal_soporte_duda") {
        await handleModalSoporteDuda(interaction);
        return;
      }
      if (customId === "modal_recompensas") {
        await handleModalRecompensas(interaction);
        return;
      }
      if (customId === "modal_ally") {
        await handleModalAlly(interaction);
        return;
      }
      if (customId === "modal_report") {
        await handleModalReport(interaction);
        return;
      }
      if (customId === "modal_rating") {
        await handleModalRating(interaction);
        return;
      }
    }

    // ── Select menus ─────────────────────────────────────────────────────
    // (no usamos por ahora, todo con botones)
  });

  // ── Guardar mensajes para transcript ──────────────────────────────────
  client.on("messageCreate", (msg) => {
    if (!msg.guild || msg.author.bot) return;
    const ticket = getTicket(msg.channel.id);
    if (!ticket || ticket.status === "closed") return;
    addMessage(msg.channel.id, {
      author: msg.author.tag,
      authorId: msg.author.id,
      content: msg.content,
      attachments: msg.attachments.map((a) => a.url),
      timestamp: msg.createdTimestamp,
    });
  });

  console.log("[Tickets] Sistema iniciado.");
}

// ── Abrir ticket: validaciones y flujo por categoría ──────────────────────
async function handleOpenTicket(interaction, category) {
  const { user, guild } = interaction;
  const config = getConfig();

  if (!config.buttons[category]) {
    return interaction.reply({ content: "❌ Esta categoría está desactivada temporalmente.", ephemeral: true });
  }

  // Límite: ya tiene ticket en esta categoría
  const existing = getTicketByUser(user.id, category);
  if (existing) {
    return interaction.reply({ content: `❌ Ya tenés un ticket abierto en esta categoría: <#${existing.channelId}>`, ephemeral: true });
  }

  // Límite: máximo 2 tickets abiertos en total
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) {
    return interaction.reply({ content: `❌ Ya tenés 2 tickets abiertos: ${openTickets.map((t) => `<#${t.channelId}>`).join(", ")}`, ephemeral: true });
  }

  // Flujo según categoría
  if (category === "soporte") {
    await interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setColor(COLORS.soporte)
        .setTitle("🎧 Soporte")
        .setDescription("¿En qué necesitás ayuda?")],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("soporte_tipo_programacion").setLabel("💻 Programación").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("soporte_tipo_dudas").setLabel("❓ Dudas").setStyle(ButtonStyle.Secondary),
      )],
    });
    return;
  }

  if (category === "recompensas") {
    return interaction.showModal(recompensasModal());
  }

  if (category === "ally") {
    return interaction.showModal(allyModal());
  }

  if (category === "report") {
    return interaction.showModal(reportModal());
  }

  if (category === "apply") {
    const { isOpen, getApplicant, canApply } = require("../utils/apply");
    const { createApplyChannel } = require("./apply");

    if (!isOpen())
      return interaction.reply({ content: "❌ Las postulaciones están cerradas en este momento.", ephemeral: true });

    // No puede postularse si ya es staff
    const STAFF_ZONE_ROLE = "1309303771087638590";
    if (interaction.member.roles.cache.has(STAFF_ZONE_ROLE))
      return interaction.reply({ content: "❌ Ya sos parte del staff, no podés postularte.", ephemeral: true });

    // Chequea si ya tiene una postulación pendiente
    const applicant = getApplicant(user.id);
    if (applicant?.status === "pending" && applicant?.channelId) {
      const existing = guild.channels.cache.get(applicant.channelId);
      if (existing)
        return interaction.reply({ content: `❌ Ya tenés una postulación en curso: <#${applicant.channelId}>`, ephemeral: true });
    }

    if (!canApply(user.id, guild))
      return interaction.reply({ content: "❌ Ya tenés una postulación activa.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const channel = await createApplyChannel(guild, user.id);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("✅ Canal creado")
        .setDescription(`Tu postulación fue creada en <#${channel.id}>. ¡Buena suerte! 🍀`)],
    });
  }
}

// ── Soporte: elegir tipo ───────────────────────────────────────────────────
async function handleSoporteTipo(interaction, tipo) {
  if (tipo === "programacion") {
    await interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(COLORS.soporte)
        .setTitle("🎧 Soporte — Programación")
        .setDescription("¿Qué lenguaje o tecnología manejás?")],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("soporte_lang_javascript").setLabel("JavaScript").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("soporte_lang_desarrollo_web").setLabel("Desarrollo Web").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("soporte_lang_python").setLabel("Python").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("soporte_lang_bdfd").setLabel("BDFD").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("soporte_lang_otros").setLabel("Otros").setStyle(ButtonStyle.Secondary),
      )],
    });
    return;
  }

  if (tipo === "dudas") {
    return interaction.showModal(soporteDudaModal());
  }
}

// ── Soporte: elegir lenguaje ───────────────────────────────────────────────
async function handleSoporteLang(interaction, lang) {
  const { user, guild } = interaction;
  await interaction.deferReply({ ephemeral: true });

  const existing = getTicketByUser(user.id, "soporte");
  if (existing) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`❌ Ya tenés un ticket de soporte abierto: <#${existing.channelId}>`)], components: [] });
  }
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Ya tenés 2 tickets abiertos.")], components: [] });
  }

  const number = nextCounter();
  const roleId = LANG_ROLES[lang];
  const langLabel = { javascript: "JavaScript", desarrollo_web: "Desarrollo Web", python: "Python", bdfd: "BDFD", otros: "Otros" }[lang];
  const mention = roleId ? `<@&${roleId}>` : `<@&${STAFF_ROLE_ID}>`;

  const channel = await createTicketChannel(guild, user.id, "soporte", number, { "Lenguaje / Área": langLabel });

  // Menciona al rol correspondiente con ghost ping
  await channel.send({ content: mention }).then((m) => m.delete().catch(() => {}));

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(COLORS.soporte).setTitle("✅ Ticket creado").setDescription(`Tu ticket fue creado en <#${channel.id}>`)],
    components: [],
  });
}

// ── Modal handlers ─────────────────────────────────────────────────────────

async function handleModalSoporteDuda(interaction) {
  const duda = interaction.fields.getTextInputValue("duda");
  const { user, guild } = interaction;

  const existing = getTicketByUser(user.id, "soporte");
  if (existing) return interaction.reply({ content: `❌ Ya tenés un ticket de soporte abierto: <#${existing.channelId}>`, ephemeral: true });
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) return interaction.reply({ content: "❌ Ya tenés 2 tickets abiertos.", ephemeral: true });

  const number = nextCounter();
  const channel = await createTicketChannel(guild, user.id, "soporte", number, { "Duda": duda });

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.soporte).setTitle("✅ Ticket creado").setDescription(`Tu ticket fue creado en <#${channel.id}>`)], ephemeral: true });
}

async function handleModalRecompensas(interaction) {
  const donde = interaction.fields.getTextInputValue("donde");
  const que = interaction.fields.getTextInputValue("que");
  const { user, guild } = interaction;

  const existing = getTicketByUser(user.id, "recompensas");
  if (existing) return interaction.reply({ content: `❌ Ya tenés un ticket de recompensas abierto: <#${existing.channelId}>`, ephemeral: true });
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) return interaction.reply({ content: "❌ Ya tenés 2 tickets abiertos.", ephemeral: true });

  const number = nextCounter();
  const channel = await createTicketChannel(guild, user.id, "recompensas", number, { "¿Dónde ganaste?": donde, "¿Qué ganaste?": que });

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.recompensas).setTitle("✅ Ticket creado").setDescription(`Tu ticket fue creado en <#${channel.id}>`)], ephemeral: true });
}

async function handleModalAlly(interaction) {
  const requisitos = interaction.fields.getTextInputValue("requisitos");
  const dedicacion = interaction.fields.getTextInputValue("dedicacion");
  const { user, guild } = interaction;

  const existing = getTicketByUser(user.id, "ally");
  if (existing) return interaction.reply({ content: `❌ Ya tenés un ticket de alianzas abierto: <#${existing.channelId}>`, ephemeral: true });
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) return interaction.reply({ content: "❌ Ya tenés 2 tickets abiertos.", ephemeral: true });

  const number = nextCounter();
  const channel = await createTicketChannel(guild, user.id, "ally", number, { "¿Cumplís requisitos?": requisitos, "¿A qué se dedica tu servidor?": dedicacion });

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.ally).setTitle("✅ Ticket creado").setDescription(`Tu ticket fue creado en <#${channel.id}>`)], ephemeral: true });
}

async function handleModalReport(interaction) {
  const objetivo = interaction.fields.getTextInputValue("objetivo");
  const porque = interaction.fields.getTextInputValue("porque");
  const { user, guild } = interaction;

  const existing = getTicketByUser(user.id, "report");
  if (existing) return interaction.reply({ content: `❌ Ya tenés un ticket de reporte abierto: <#${existing.channelId}>`, ephemeral: true });
  const openTickets = getUserOpenTickets(user.id);
  if (openTickets.length >= 2) return interaction.reply({ content: "❌ Ya tenés 2 tickets abiertos.", ephemeral: true });

  const number = nextCounter();
  const channel = await createTicketChannel(guild, user.id, "report", number, { "¿Qué reportás?": objetivo, "¿Por qué?": porque });

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.report).setTitle("✅ Ticket creado").setDescription(`Tu ticket fue creado en <#${channel.id}>`)], ephemeral: true });
}

// ── Claim ──────────────────────────────────────────────────────────────────
async function handleClaim(interaction) {
  const { user, channel, guild } = interaction;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member?.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Solo el staff puede reclamar tickets.", ephemeral: true });
  }

  const ticket = getTicket(channel.id);
  if (!ticket) return interaction.reply({ content: "❌ Este no es un canal de ticket.", ephemeral: true });

  // No puede reclamar su propio ticket
  if (ticket.userId === user.id) {
    return interaction.reply({ content: "❌ No podés reclamar tu propio ticket.", ephemeral: true });
  }

  if (ticket.claimedBy === user.id) {
    // Desclaim
    updateTicket(channel.id, { claimedBy: null });
    const updated = getTicket(channel.id);
    const embed = ticketEmbed(updated, updated.extraFields);
    const msg = await channel.messages.fetch(ticket.embedMessageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [embed], components: [ticketButtons()] });
    return interaction.reply({ content: "✅ Ticket liberado.", ephemeral: true });
  }

  updateTicket(channel.id, { claimedBy: user.id });
  const updated = getTicket(channel.id);
  const embed = ticketEmbed(updated, updated.extraFields);
  const msg = await channel.messages.fetch(ticket.embedMessageId).catch(() => null);
  if (msg) await msg.edit({ embeds: [embed], components: [ticketButtons()] });
  return interaction.reply({ content: `✅ Ticket reclamado por <@${user.id}>.`, ephemeral: true });
}

// ── Cerrar: mostrar opciones ───────────────────────────────────────────────
async function handleClosePrompt(interaction) {
  const { channel, guild, user } = interaction;
  const ticket = getTicket(channel.id);
  if (!ticket) return interaction.reply({ content: "❌ Este no es un canal de ticket.", ephemeral: true });
  if (ticket.status === "locked") return interaction.reply({ content: "❌ El ticket ya está cerrado.", ephemeral: true });

  const member = await guild.members.fetch(user.id).catch(() => null);
  const isStaff = member?.roles.cache.has(STAFF_ROLE_ID);
  const isOwner = ticket.userId === user.id;
  if (!isStaff && !isOwner) return interaction.reply({ content: "❌ No tenés permiso para cerrar este ticket.", ephemeral: true });

  // Marca que está en proceso de cierre para el auto-cierre
  updateTicket(channel.id, { pendingClose: true });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_rate_close").setLabel("⭐ Valorar y transcribir").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_close_direct").setLabel("🔒 Cerrar sin valorar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_reopen_pending").setLabel("🔓 Retomar").setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔒 ¿Cerrar ticket?")
      .setDescription("Elegí una opción. Si no realizás ninguna acción en **10 minutos**, el ticket se cerrará automáticamente.")
      .addFields(
        { name: "⭐ Valorar y transcribir", value: "Dejás una valoración al staff y se guarda el historial.", inline: false },
        { name: "🔒 Cerrar sin valorar", value: "Se cierra y se guarda el historial sin valoración.", inline: false },
        { name: "🔓 Retomar", value: "Cancelá el cierre y seguí con el ticket.", inline: false },
      )],
    components: [closeRow],
  });

  // Auto-cierre a los 10 minutos si no hace nada
  setTimeout(async () => {
    const current = getTicket(channel.id);
    if (current && current.status === "open" && current.pendingClose) {
      await channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("⏱️ Cierre automático")
          .setDescription("No se realizó ninguna acción. El ticket se cerrará ahora.")
          .setTimestamp()],
      }).catch(() => {});
      await doClose(channel, guild, null, null, null);
    }
  }, 10 * 60 * 1000);
}

// ── Retomar desde el prompt de cierre ─────────────────────────────────────
async function handleReopenPending(interaction) {
  const { channel } = interaction;
  const ticket = getTicket(channel.id);
  if (!ticket) return interaction.reply({ content: "❌ Este no es un canal de ticket.", ephemeral: true });

  updateTicket(channel.id, { pendingClose: false });

  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("✅ Ticket retomado")
      .setDescription("El cierre fue cancelado. El ticket sigue abierto.")],
    components: [],
  });
}

// ── Cerrar directo (sin valorar) ───────────────────────────────────────────
async function handleCloseDirect(interaction) {
  const { channel, guild } = interaction;
  // Deshabilita botones del ephemeral
  await interaction.update({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_rate_close").setLabel("⭐ Valorar y transcribir").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("ticket_close_direct").setLabel("🔒 Cerrando...").setStyle(ButtonStyle.Danger).setDisabled(true),
      new ButtonBuilder().setCustomId("ticket_reopen_pending").setLabel("🔓 Retomar").setStyle(ButtonStyle.Secondary).setDisabled(true),
    )],
  });
  await doClose(channel, guild, null, null, null);
}

// ── Modal: valoración ──────────────────────────────────────────────────────
async function handleModalRating(interaction) {
  const { channel, guild, user } = interaction;
  const starsRaw = interaction.fields.getTextInputValue("stars");
  const comment = interaction.fields.getTextInputValue("comment");
  const stars = parseInt(starsRaw);

  if (!stars || stars < 1 || stars > 5 || !Number.isInteger(stars)) {
    return interaction.reply({ content: "❌ Las estrellas deben ser un número entero del 1 al 5.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // Deshabilita los botones del ephemeral de cierre
  await interaction.message?.edit({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("ticket_rate_close").setLabel("⭐ Valorado").setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("ticket_close_direct").setLabel("🔒 Cerrar sin valorar").setStyle(ButtonStyle.Danger).setDisabled(true),
      new ButtonBuilder().setCustomId("ticket_reopen_pending").setLabel("🔓 Retomar").setStyle(ButtonStyle.Secondary).setDisabled(true),
    )],
  }).catch(() => {});

  await doClose(channel, guild, stars, comment, null, user.id);
  await interaction.editReply({ content: "✅ Valoración enviada. El ticket fue cerrado." });
}

// ── Cerrar: lógica central ─────────────────────────────────────────────────
async function doClose(channel, guild, stars, comment, interaction, raterUserId = null) {
  const ticket = getTicket(channel.id);
  if (!ticket || ticket.status === "locked" || ticket.status === "closed") return;

  updateTicket(channel.id, { pendingClose: false });

  // Bloquea escritura para todos menos staff
  await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch(() => {});

  updateTicket(channel.id, { status: "locked" });

  // Edita el embed principal
  const ticketMsg = await channel.messages.fetch(ticket.embedMessageId).catch(() => null);
  if (ticketMsg) {
    const embed = ticketEmbed({ ...ticket, status: "locked" }, ticket.extraFields);
    await ticketMsg.edit({ embeds: [embed], components: [ticketButtons(true)] }).catch(() => {});
  }

  // Embed de cierre con cuenta regresiva
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle("🔒 Ticket cerrado")
      .setDescription("Este ticket fue cerrado. El canal se eliminará en **10 segundos**.")
      .setTimestamp()],
  });

  // Stats
  if (ticket.claimedBy) {
    addStat(ticket.claimedBy, stars ?? null);
  }

  // Genera transcript siempre
  const html = generateTranscript(ticket, channel.name);
  const buf = Buffer.from(html, "utf-8");
  const transcriptFile = { attachment: buf, name: `transcript-${ticket.number}.html` };

  // Logs
  const logEmbed = new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle(`🔒 Ticket #${ticket.number} cerrado`)
    .addFields(
      { name: "Canal", value: `#${channel.name}`, inline: true },
      { name: "Usuario", value: `<@${ticket.userId}>`, inline: true },
      { name: "Categoría", value: CATEGORY_NAMES[ticket.category], inline: true },
      { name: "Reclamado por", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Nadie", inline: true },
      { name: "Valoración", value: stars ? `${"⭐".repeat(stars)} (${stars}/5)` : "Sin valorar", inline: true },
      { name: "Comentario", value: comment || "—", inline: false },
    )
    .setTimestamp();

  await sendLog(guild, logEmbed, [transcriptFile]);

  // Borra el canal a los 10 segundos
  setTimeout(() => {
    closeTicket(channel.id);
    channel.delete("Ticket cerrado").catch(() => {});
  }, 10_000);
}

// ── Unlock ─────────────────────────────────────────────────────────────────
async function handleUnlock(interaction) {
  const { user, channel, guild } = interaction;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member?.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({ content: "❌ Solo el staff puede retomar tickets.", ephemeral: true });
  }

  const ticket = getTicket(channel.id);
  if (!ticket) return;

  await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: true }).catch(() => {});
  updateTicket(channel.id, { status: "open" });

  const ticketMsg = await channel.messages.fetch(ticket.embedMessageId).catch(() => null);
  if (ticketMsg) {
    const embed = ticketEmbed({ ...ticket, status: "open" }, ticket.extraFields)
      .setFooter({ text: "Ticket retomado por el staff." });
    await ticketMsg.edit({ embeds: [embed], components: [ticketButtons(false)] }).catch(() => {});
  }

  await interaction.reply({ content: `✅ El ticket fue retomado por <@${user.id}>.` });
}

// ── Modales ────────────────────────────────────────────────────────────────
function soporteDudaModal() {
  return new ModalBuilder()
    .setCustomId("modal_soporte_duda")
    .setTitle("❓ Soporte — Duda")
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId("duda").setLabel("¿Cuál es tu duda?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
    ));
}

function recompensasModal() {
  return new ModalBuilder()
    .setCustomId("modal_recompensas")
    .setTitle("🏆 Recompensas")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("donde").setLabel("¿Dónde ganaste?").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("que").setLabel("¿Qué ganaste?").setStyle(TextInputStyle.Short).setRequired(true)),
    );
}

function allyModal() {
  return new ModalBuilder()
    .setCustomId("modal_ally")
    .setTitle("🤝 Alianzas")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("requisitos").setLabel("¿Cumplís los requisitos?").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("dedicacion").setLabel("¿A qué se dedica tu servidor?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
    );
}

function reportModal() {
  return new ModalBuilder()
    .setCustomId("modal_report")
    .setTitle("🚨 Reporte")
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("objetivo").setLabel("¿Qué reportás? (Bot / Usuario)").setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("porque").setLabel("¿Por qué? Adjuntá pruebas en el ticket.").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
    );
}

function ratingModal() {
  return new ModalBuilder()
    .setCustomId("modal_rating")
    .setTitle("⭐ Valorar ticket")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("stars").setLabel("Estrellas (1 al 5, número entero)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("comment").setLabel("Comentario (opcional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500),
      ),
    );
}

module.exports = { setupTickets };