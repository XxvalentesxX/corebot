// commands/prefix/music/skip.js
module.exports = {
  name: "skip",
  aliases: ["s"],
  description: "Salta la canción actual",
  async execute(msg, args) {
    const queue = msg.client.getMusicQueue(msg.guild.id);
    try {
      queue.skip();
      msg.reply("⏭️ Canción saltada.");
    } catch (err) {
      msg.reply(`❌ ${err.message}`);
    }
  }
};