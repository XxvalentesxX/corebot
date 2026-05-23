// commands/prefix/moderation/purge.js
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { errorEmbed, hasModRole, sendLog } = require("../../../../utils/mod");

module.exports = {
  name: "purge",
  aliases: ["clear"],
  description: "Borra mensajes en masa",
  async execute(msg, args) {
    if (!hasModRole(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return msg.reply({
      embeds: [errorEmbed("Especifica un número entre 1 y 100.\nUso: `!purge <cantidad>`")]
    });

    try {
      const messages = await msg.channel.messages.fetch({ limit: amount + 1 });
      const toDelete = messages.filter((m) => !m.pinned).first(amount);

      // Genera el .txt con los últimos 20 mensajes
      const last20 = [...messages.values()]
        .filter((m) => m.id !== msg.id)
        .slice(0, 20)
        .reverse()
        .map((m) => `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.tag}: ${m.content || "[sin texto]"}`)
        .join("\n");

      const txtBuffer = Buffer.from(last20, "utf-8");
      const attachment = new AttachmentBuilder(txtBuffer, { name: `purge-${msg.channel.name}-${Date.now()}.txt` });

      await msg.delete().catch(() => {});
      const deleted = await msg.channel.bulkDelete(toDelete, true);

      const reply = await msg.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle("🗑️ Mensajes Eliminados")
            .addFields(
              { name: "Eliminados", value: `${deleted.size}`, inline: true },
              { name: "Canal", value: `${msg.channel}`, inline: true },
              { name: "Moderador", value: `${msg.author.tag}`, inline: true },
            )
            .setTimestamp()
        ]
      });
      setTimeout(() => reply.delete().catch(() => {}), 3000);

      await sendLog(msg.guild,
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("🗑️ Purge — Log")
          .addFields(
            { name: "Eliminados", value: `${deleted.size}`, inline: true },
            { name: "Canal", value: `${msg.channel}`, inline: true },
            { name: "Moderador", value: `${msg.author.tag}`, inline: true },
          )
          .setFooter({ text: "Últimos 20 mensajes adjuntos" })
          .setTimestamp(),
        [attachment]
      );
    } catch (err) {
      msg.reply({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)] });
    }
  }
};