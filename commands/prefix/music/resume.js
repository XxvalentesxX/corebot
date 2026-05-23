// commands/prefix/music/resume.js
module.exports = {
  name: "resume",
  aliases: ["r"],
  description: "Reanuda la música",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);
    try {
      queue.resume();
      msg.reply("▶️ Música reanudada.");
    } catch (err) {
      msg.reply(`❌ ${err.message}`);
    }
  }
};