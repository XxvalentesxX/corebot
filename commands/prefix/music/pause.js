// commands/prefix/music/pause.js
module.exports = {
  name: "pause",
  description: "Pausa la música",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);
    try {
      queue.pause();
      msg.reply("⏸️ Música pausada.");
    } catch (err) {
      msg.reply(`❌ ${err.message}`);
    }
  }
};