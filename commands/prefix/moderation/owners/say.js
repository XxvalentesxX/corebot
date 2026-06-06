// commands/prefix/moderation/owners/say.js
const { EmbedBuilder } = require("discord.js");
const { OWNERS }       = require("../../../../config");

function isOwnerOrAdmin(member) {
  return (
    OWNERS.includes(member.id) ||
    member.roles.cache.has("1309303092952563725") || // Admin
    member.permissions.has("Administrator")
  );
}

module.exports = {
  name: "say",
  aliases: ["echo"],
  description: "Hace que el bot diga algo (solo Owners y Admins)",

  async execute(msg, args) {
    if (!isOwnerOrAdmin(msg.member)) return; // Silencio total

    const text = args.join(" ");
    if (!text) return; // Sin texto, ignora

    // Borra el comando del autor
    await msg.delete().catch(() => {});

    // Manda el mensaje como embed limpio
    await msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(text),
      ],
    });
  },
};