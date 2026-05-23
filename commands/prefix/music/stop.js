// commands/prefix/music/stop.js
module.exports = {
  name: "stop",
  aliases: ["st"],
  description: "Detiene la música y limpia la cola",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);
    if (!queue.connection) return msg.reply("❌ No estoy en ningún canal de voz.");
    queue.destroy();
    msg.client.musicQueues.delete(msg.guild.id);
    msg.reply("⏹️ Música detenida y cola limpiada.");
  }
};