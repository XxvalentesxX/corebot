// commands/prefix/music/leave.js
module.exports = {
  name: "leave",
  aliases: ["disconnect", "dc"],
  description: "Desconecta el bot del canal de voz",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);
    if (!queue.connection) return msg.reply("❌ No estoy en ningún canal de voz.");
    queue.destroy();
    msg.client.musicQueues.delete(msg.guild.id);
    msg.reply("👋 Desconectado.");
  }
};