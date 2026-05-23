// commands/prefix/music/queue.js
module.exports = {
  name: "queue",
  aliases: ["q"],
  description: "Muestra la cola de canciones",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);

    if (!queue.current && !queue.queue.length) {
      return msg.reply("❌ No hay canciones en la cola.");
    }

    const list = queue.queue
      .slice(0, 10)
      .map((s, i) => `**${i + 1}.** ${s.title} (${s.duration})`)
      .join("\n");

    msg.reply(
      `🎵 **Reproduciendo:** ${queue.current?.title ?? "Nada"}\n\n` +
      `📋 **Cola:**\n${list || "Vacía"}`
    );
  }
};