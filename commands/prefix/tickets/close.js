// commands/prefix/moderation/close.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const { getTicket } = require("../../../utils/tickets");
const { STAFF_ROLE_ID } = require("../../../config");

module.exports = {
  name: "close",
  aliases: ["cls"],
  description: "Cierra el ticket actual.",
  async execute(msg, args) {
    const ticket = getTicket(msg.channel.id);
    if (!ticket)
      return msg.reply({ embeds: [errorEmbed("Este canal no es un ticket.")] });

    const isStaff = msg.member.roles.cache.has(STAFF_ROLE_ID);
    const isOwner = ticket.userId === msg.author.id;
    if (!isStaff && !isOwner)
      return msg.reply({ embeds: [errorEmbed("No tenés permiso para cerrar este ticket.")] });

    await msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🔒 Cerrar ticket")
        .setDescription("¿Cómo querés cerrarlo?")],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_rate_close").setLabel("⭐ Valorar y transcribir").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket_close_direct").setLabel("🔒 Cerrar sin valorar").setStyle(ButtonStyle.Danger),
      )],
    });

    // Auto-cierre a los 10 minutos
    setTimeout(async () => {
      const current = getTicket(msg.channel.id);
      if (current && current.status === "open") {
        const { doClose } = require("../../../systems/tickets");
        if (doClose) await doClose(msg.channel, msg.guild, null, null, null);
      }
    }, 10 * 60 * 1000);
  },
};