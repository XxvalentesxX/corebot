// commands/prefix/moderation/stats.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const { getStats } = require("../../../utils/tickets");
const { STAFF_ROLE_ID } = require("../../../config");

function starBar(avg) {
  const full  = Math.floor(avg);
  const half  = avg - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return "⭐".repeat(full) + (half ? "✨" : "") + "☆".repeat(empty);
}

module.exports = {
  name: "stats",
  aliases: ["st"],
  description: "Muestra las estadísticas de tickets del staff.",
  async execute(msg, args) {
    if (!msg.member.roles.cache.has(STAFF_ROLE_ID))
      return msg.reply({ embeds: [errorEmbed("Solo el staff puede ver sus estadísticas.")] });

    // Si se menciona a alguien y sos admin, muestra sus stats
    const target = msg.mentions.members.first() ?? msg.member;

    if (target.id !== msg.author.id && !msg.member.permissions.has("Administrator"))
      return msg.reply({ embeds: [errorEmbed("Solo los admins pueden ver las stats de otros.")] });

    const s = getStats(target.id);
    const avg = s.ratings > 0 ? (s.totalStars / s.ratings).toFixed(1) : null;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 Estadísticas — ${target.user.tag}`)
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: "🎫 Tickets atendidos", value: `${s.attended}`, inline: true },
        { name: "⭐ Valoraciones recibidas", value: `${s.ratings}`, inline: true },
        { name: "📈 Promedio de estrellas", value: avg ? `${starBar(parseFloat(avg))} (${avg}/5)` : "Sin valoraciones aún", inline: false },
      )
      .setTimestamp();

    return msg.reply({ embeds: [embed] });
  },
};