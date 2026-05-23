// commands/prefix/music/play.js
module.exports = {
  name: "play",
  aliases: ["p"],
  description: "Reproduce una canción",
  async execute(msg, args) {
    if (!args.length) return msg.reply("❌ Debes proporcionar una canción o URL.");

    const query = args.join(" ");
    const queue = msg.client.getMusicQueue(msg.guild.id);

    try {
      await queue.connect(msg);
      const song = await queue.add(query);

      if (!queue.playing) {
        await queue._next();
      } else {
        msg.reply(`✅ Agregado a la cola: **${song.title}** (${song.duration})`);
      }
    } catch (err) {
      msg.reply(`❌ ${err.message}`);
    }
  }
};