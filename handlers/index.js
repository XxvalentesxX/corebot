// handlers/index.js
const { CommandHandler } = require("./commands");
const { MusicQueue } = require("./MusicQueue");

class Handler {
  constructor(client, prefix) {
    this._cmd = new CommandHandler(client, prefix);

    client.musicQueues = new Map();
    client.getMusicQueue = (guildId) => {
      if (!client.musicQueues.has(guildId)) {
        client.musicQueues.set(guildId, new MusicQueue());
      }
      return client.musicQueues.get(guildId);
    };

    this._listenButtons(client);
  }

  commands(path) {
    this._cmd.load(path);
    return this;
  }

  _listenButtons(client) {
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("music_")) return;

      const queue = client.getMusicQueue(interaction.guild.id);
      await interaction.deferUpdate();

      try {
        switch (interaction.customId) {
          case "music_previous":
            await queue.previous();
            break;
          case "music_pause":
            queue.paused ? queue.resume() : queue.pause();
            break;
          case "music_skip":
            queue.skip();
            break;
          case "music_loop":
            const looping = queue.toggleLoop();
            await interaction.followUp({
              content: `🔁 Loop ${looping ? "activado" : "desactivado"}.`,
              ephemeral: true,
            });
            break;
          case "music_shuffle":
            queue.shuffle();
            await interaction.followUp({
              content: "🔀 Cola mezclada.",
              ephemeral: true,
            });
            break;
          case "music_voldown":
            const vd = queue.setVolume(-0.1);
            await interaction.followUp({
              content: `🔉 Volumen: ${Math.round(vd * 100)}%`,
              ephemeral: true,
            });
            break;
          case "music_volup":
            const vu = queue.setVolume(0.1);
            await interaction.followUp({
              content: `🔊 Volumen: ${Math.round(vu * 100)}%`,
              ephemeral: true,
            });
            break;
          case "music_queue":
            const list = queue.queue
              .slice(0, 10)
              .map((s, i) => `**${i + 1}.** ${s.title} (${s.duration})`)
              .join("\n");
            await interaction.followUp({
              content: `📋 **Cola:**\n${list || "Vacía"}`,
              ephemeral: true,
            });
            break;
          case "music_stop":
            queue.destroy();
            client.musicQueues.delete(interaction.guild.id);
            await interaction.followUp({
              content: "⏹️ Música detenida y cola limpiada.",
              ephemeral: true,
            });
            break;
        }
      } catch (err) {
        await interaction.followUp({
          content: `❌ ${err.message}`,
          ephemeral: true,
        });
      }
    });
  }
}

module.exports = { Handler };