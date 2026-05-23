// systems/giveaway.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
  getGiveaway, getActiveGiveaways, updateGiveaway,
  addEntry, removeEntry, addThankEntry, pickWinnersWithRoles,
  purgeOldEnded,
} = require("../utils/giveaway");

const GIVEAWAY_ROLE = "1309309207014805575";

// Timers activos en memoria: messageId → setTimeout handle
const timers = new Map();

// ── Embed del sorteo ───────────────────────────────────────────────────────
function buildGiveawayEmbed(gw) {
  const reqs = [];
  if (gw.requirements?.roles?.length)
    reqs.push(`🎭 Tener alguno de estos roles: ${gw.requirements.roles.map((r) => `<@&${r}>`).join(", ")}`);
  if (gw.requirements?.thankHost)
    reqs.push(`💬 Agradecer al hosteador en el hilo del sorteo`);
  if (gw.requirements?.memberCount)
    reqs.push(`👥 Global: se resuelve al llegar a **${gw.requirements.memberCount}** miembros en el server`);
  if (gw.requirements?.entryCount)
    reqs.push(`🎟️ Global: se resuelve al llegar a **${gw.requirements.entryCount}** participantes`);
  if (gw.requirements?.serverAgeMs)
    reqs.push(`⏳ Llevar al menos **${formatMs(gw.requirements.serverAgeMs)}** en el servidor`);

  const embed = new EmbedBuilder()
    .setColor(gw.status === "active" ? 0x7B2FBE : 0x4A4A6A)
    .setTitle(`🎉 ${gw.prize}`)
    .addFields(
      { name: "🏆 Ganadores",    value: `${gw.maxWinners}`,                                                                             inline: true },
      { name: "🎟️ Participantes", value: `${gw.entries.length}${gw.maxEntries ? `/${gw.maxEntries}` : ""}`,                             inline: true },
      { name: "⏰ Termina",       value: `<t:${Math.floor(gw.endsAt / 1000)}:R> (<t:${Math.floor(gw.endsAt / 1000)}:F>)`,               inline: false },
      { name: "👤 Hosteado por",  value: `<@${gw.hostId}>`,                                                                             inline: true },
      ...(reqs.length ? [{ name: "📋 Requisitos", value: reqs.join("\n"), inline: false }] : []),
    )
    .setFooter({ text: `ID: ${gw.id}` })
    .setTimestamp();

  return embed;
}

function buildEndedEmbed(gw, winners) {
  return new EmbedBuilder()
    .setColor(0x4A4A6A)
    .setTitle(`🎊 ${gw.prize} — Finalizado`)
    .addFields(
      { name: "🏆 Ganador/es",        value: winners.length ? winners.map((id) => `<@${id}>`).join(", ") : "Nadie cumplió los requisitos.", inline: false },
      { name: "🎟️ Participantes totales", value: `${gw.entries.length}`, inline: true },
      { name: "👤 Hosteado por",       value: `<@${gw.hostId}>`, inline: true },
    )
    .setFooter({ text: `ID: ${gw.id}` })
    .setTimestamp();
}

function formatMs(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(" ") || "0m";
}

function entryButton(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw_enter")
      .setLabel("🎉 Participar")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("gw_end_from_msg")
      .setLabel("🏁 Terminar")
      .setStyle(ButtonStyle.Secondary),
  );
}

function endedButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw_enter")
      .setLabel("🎉 Participar")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("gw_reroll_from_msg")
      .setLabel("🔄 Reroll")
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Publicar sorteo ────────────────────────────────────────────────────────
async function publishGiveaway(client, gwData) {
  const guild   = await client.guilds.fetch(gwData.guildId).catch(() => null);
  const channel = guild?.channels.cache.get(gwData.channelId);
  if (!channel) return null;

  const embed = buildGiveawayEmbed({ ...gwData, entries: [], id: "pending" });
  const msg   = await channel.send({
    content: `<@&${GIVEAWAY_ROLE}>`,
    embeds: [embed],
    components: [entryButton()],
  });

  const { createGiveaway } = require("../utils/giveaway");
  const gw = createGiveaway({ ...gwData, id: msg.id });

  await msg.edit({ embeds: [buildGiveawayEmbed(gw)], components: [entryButton()] }).catch(() => {});

  // Crea hilo si se requiere agradecer al hosteador
  if (gw.requirements?.thankHost) {
    const thread = await msg.startThread({
      name: `💬 Agradecimientos — ${gw.prize}`,
      autoArchiveDuration: 1440,
    }).catch(() => null);
    if (thread) {
      updateGiveaway(msg.id, { threadId: thread.id });
      await thread.send({
        embeds: [new EmbedBuilder()
          .setColor(0x7B2FBE)
          .setDescription(`Para participar en este sorteo debés agradecer al hosteador <@${gw.hostId}> mandando cualquier mensaje acá.`)],
      });
    }
  }

  scheduleEnd(client, msg.id, gw.endsAt);
  return msg;
}

// ── Timer de fin ───────────────────────────────────────────────────────────
function scheduleEnd(client, messageId, endsAt) {
  const delay = endsAt - Date.now();
  if (delay <= 0) {
    endGiveaway(client, messageId);
    return;
  }
  const handle = setTimeout(() => endGiveaway(client, messageId), delay);
  timers.set(messageId, handle);
}

// ── Terminar sorteo ────────────────────────────────────────────────────────
async function endGiveaway(client, messageId, forced = false) {
  const gw = getGiveaway(messageId);
  if (!gw || gw.status !== "active") return;

  const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
  if (!guild) return;
  const channel = guild.channels.cache.get(gw.channelId);
  if (!channel) return;

  const winners = await pickWinnersWithRoles(gw, gw.maxWinners, guild);
  updateGiveaway(messageId, { status: "ended", winners, endsAt: Date.now() });

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) {
    await msg.edit({
      content: "",
      embeds: [buildEndedEmbed({ ...gw, entries: gw.entries }, winners)],
      components: [endedButtons()],
    }).catch(() => {});
  }

  const winnerText = winners.length
    ? `🎉 ¡Felicitaciones ${winners.map((id) => `<@${id}>`).join(", ")}! Ganaron **${gw.prize}**.`
    : `❌ Nadie cumplió los requisitos para ganar **${gw.prize}**.`;

  await channel.send({ content: winnerText }).catch(() => {});

  if (gw.threadId) {
    const thread = guild.channels.cache.get(gw.threadId);
    if (thread) await thread.setArchived(true).catch(() => {});
  }

  timers.delete(messageId);
}

// ── Reroll ─────────────────────────────────────────────────────────────────
async function rerollGiveaway(client, messageId, count = 1) {
  const gw = getGiveaway(messageId);
  if (!gw || gw.status !== "ended") return null;

  const guild = await client.guilds.fetch(gw.guildId).catch(() => null);
  if (!guild) return null;

  const newWinners = await pickWinnersWithRoles(gw, count, guild);
  updateGiveaway(messageId, { winners: newWinners });

  const channel = guild.channels.cache.get(gw.channelId);
  if (channel) {
    const winnerText = newWinners.length
      ? `🔄 **Reroll** — Nuevos ganadores de **${gw.prize}**: ${newWinners.map((id) => `<@${id}>`).join(", ")} 🎉`
      : `🔄 **Reroll** — Nadie cumplió los requisitos.`;
    await channel.send({ content: winnerText }).catch(() => {});
  }

  return newWinners;
}

// ── Setup ──────────────────────────────────────────────────────────────────
function setupGiveaway(client) {
  client.once("clientReady", () => {
    const removed = purgeOldEnded(7);
    if (removed > 0) console.log(`[Giveaway] ${removed} sorteo(s) eliminado(s) por tener más de 7 días.`);

    const active = getActiveGiveaways();
    for (const gw of active) {
      scheduleEnd(client, gw.id, gw.endsAt);
    }
    console.log(`[Giveaway] ${active.length} sorteos retomados.`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    const { customId, user, message, guild } = interaction;

    const ADMIN_ROLE = "1309303092952563725";
    const { OWNERS } = require("../config");

    const isHostOrAdmin = async () => {
      const gw = getGiveaway(message.id);
      if (!gw) return false;
      if (gw.hostId === user.id) return true;
      const member = await guild.members.fetch(user.id).catch(() => null);
      return OWNERS.includes(user.id) || member?.roles.cache.has(ADMIN_ROLE) || member?.permissions.has("Administrator");
    };

    // Terminar desde el embed
    if (customId === "gw_end_from_msg") {
      const gw = getGiveaway(message.id);
      if (!gw || gw.status !== "active")
        return interaction.reply({ content: "❌ Este sorteo ya terminó.", ephemeral: true });
      if (!await isHostOrAdmin())
        return interaction.reply({ content: "❌ Solo el hosteador o un admin puede terminar este sorteo.", ephemeral: true });
      await interaction.deferUpdate();
      await endGiveaway(client, message.id, true);
      return;
    }

    // Reroll desde el embed (siempre reroll de 1, para más usar !g reroll)
    if (customId === "gw_reroll_from_msg") {
      const gw = getGiveaway(message.id);
      if (!gw || gw.status !== "ended")
        return interaction.reply({ content: "❌ Este sorteo todavía está activo.", ephemeral: true });
      if (!await isHostOrAdmin())
        return interaction.reply({ content: "❌ Solo el hosteador o un admin puede hacer reroll.", ephemeral: true });
      await interaction.deferUpdate();
      await rerollGiveaway(client, message.id, 1);
      return;
    }

    if (customId !== "gw_enter") return;

    const gw = getGiveaway(message.id);

    if (!gw || gw.status !== "active")
      return interaction.reply({ content: "❌ Este sorteo ya terminó.", ephemeral: true });

    if (gw.entries.includes(user.id)) {
      removeEntry(message.id, user.id);
      const updated = getGiveaway(message.id);
      await message.edit({ embeds: [buildGiveawayEmbed(updated)], components: [entryButton()] }).catch(() => {});
      return interaction.reply({ content: "✅ Saliste del sorteo.", ephemeral: true });
    }

    if (gw.maxEntries && gw.entries.length >= gw.maxEntries)
      return interaction.reply({ content: "❌ El sorteo ya alcanzó el máximo de participantes.", ephemeral: true });

    addEntry(message.id, user.id);
    const updated = getGiveaway(message.id);
    await message.edit({ embeds: [buildGiveawayEmbed(updated)], components: [entryButton()] }).catch(() => {});
    await interaction.reply({ content: "🎉 ¡Entraste al sorteo! Presioná de nuevo para salir.", ephemeral: true });

    if (gw.requirements?.entryCount && updated.entries.length >= gw.requirements.entryCount) {
      await endGiveaway(client, message.id, true);
    }
  });

  // Hilo: agradecer al hosteador
  client.on("messageCreate", async (msg) => {
    if (!msg.guild || msg.author.bot || !msg.channel.isThread()) return;
    const active = getActiveGiveaways();
    const gw = active.find((g) => g.threadId === msg.channel.id);
    if (!gw) return;
    addThankEntry(gw.id, msg.author.id);
  });

  // Chequeo de memberCount
  client.on("guildMemberAdd", async (member) => {
    const active = getActiveGiveaways().filter((g) => g.guildId === member.guild.id && g.requirements?.memberCount);
    for (const gw of active) {
      if (member.guild.memberCount >= gw.requirements.memberCount) {
        await endGiveaway(client, gw.id, true);
      }
    }
  });

  console.log("[Giveaway] Sistema iniciado.");
}

module.exports = { setupGiveaway, publishGiveaway, endGiveaway, rerollGiveaway, buildGiveawayEmbed, entryButton, scheduleEnd };