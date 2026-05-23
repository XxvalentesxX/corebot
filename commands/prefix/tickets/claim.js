// commands/prefix/moderation/claim.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const { getTicket, updateTicket } = require("../../../utils/tickets");
const { STAFF_ROLE_ID } = require("../../../config");

function ticketEmbed(ticket) {
  const COLORS = { soporte: 0x5865f2, recompensas: 0xf1c40f, apply: 0x2ecc71, ally: 0x1abc9c, report: 0xe74c3c };
  const NAMES  = { soporte: "🎧 Soporte", recompensas: "🏆 Recompensas", apply: "📋 Apply", ally: "🤝 Alianzas", report: "🚨 Reporte" };
  return new EmbedBuilder()
    .setColor(COLORS[ticket.category] ?? 0x5865f2)
    .setTitle(`${NAMES[ticket.category]} — Ticket #${ticket.number}`)
    .addFields(
      { name: "Usuario", value: `<@${ticket.userId}>`, inline: true },
      { name: "Estado", value: ticket.status === "open" ? "🟢 Abierto" : "🔒 Cerrado", inline: true },
      { name: "Reclamado por", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Sin reclamar", inline: true },
      ...Object.entries(ticket.extraFields ?? {}).map(([k, v]) => ({ name: k, value: String(v), inline: false })),
    )
    .setTimestamp();
}

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
function ticketButtons(locked = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("🙋 Reclamar").setStyle(ButtonStyle.Primary).setDisabled(locked),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Cerrar").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ...(locked ? [new ButtonBuilder().setCustomId("ticket_unlock").setLabel("🔓 Retomar").setStyle(ButtonStyle.Success)] : []),
  );
}

module.exports = {
  name: "claim",
  aliases: ["cl"],
  description: "Reclama o libera el ticket actual.",
  async execute(msg, args) {
    if (!msg.member.roles.cache.has(STAFF_ROLE_ID))
      return msg.reply({ embeds: [errorEmbed("Solo el staff puede reclamar tickets.")] });

    const ticket = getTicket(msg.channel.id);
    if (!ticket)
      return msg.reply({ embeds: [errorEmbed("Este canal no es un ticket.")] });

    if (ticket.claimedBy === msg.author.id) {
      updateTicket(msg.channel.id, { claimedBy: null });
      const updated = getTicket(msg.channel.id);
      const embedMsg = await msg.channel.messages.fetch(ticket.embedMessageId).catch(() => null);
      if (embedMsg) await embedMsg.edit({ embeds: [ticketEmbed(updated)], components: [ticketButtons()] });
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xf39c12).setDescription("✅ Ticket liberado.")] });
    }

    if (ticket.claimedBy && ticket.claimedBy !== msg.author.id) {
      return msg.reply({ embeds: [errorEmbed(`Este ticket ya está reclamado por <@${ticket.claimedBy}>.`)] });
    }

    updateTicket(msg.channel.id, { claimedBy: msg.author.id });
    const updated = getTicket(msg.channel.id);
    const embedMsg = await msg.channel.messages.fetch(ticket.embedMessageId).catch(() => null);
    if (embedMsg) await embedMsg.edit({ embeds: [ticketEmbed(updated)], components: [ticketButtons()] });
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription(`✅ Ticket reclamado por <@${msg.author.id}>.`)] });
  },
};