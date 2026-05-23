// handlers/MusicQueue.js
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} = require("@discordjs/voice");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const { PassThrough } = require("stream");
const { buildMusicEmbed, buildMusicButtons } = require("./buttons");

const execFileAsync = promisify(execFile);
const YTDLP = path.join(process.cwd(), "yt-dlp.exe");

async function getInfo(query) {
  const isUrl = query.startsWith("http");
  const target = isUrl ? query : `ytsearch1:${query}`;

  const { stdout } = await execFileAsync(YTDLP, [
    "--dump-json",
    "--no-playlist",
    "--quiet",
    target,
  ]);

  const info = JSON.parse(stdout);
  return {
    title: info.title,
    url: info.webpage_url,
    duration: info.duration_string ?? "??",
  };
}

function createStream(url) {
  const stream = new PassThrough({ highWaterMark: 1 << 25 });

  const ytdlp = spawn(YTDLP, [
    "-f", "bestaudio",
    "-o", "-",
    "--no-playlist",
    "--quiet",
    url,
  ]);

  const ffmpeg = spawn(ffmpegPath, [
    "-loglevel", "error",
    "-analyzeduration", "0",
    "-probesize", "32k",
    "-i", "pipe:0",
    "-vn",
    "-c:a", "libopus",
    "-b:a", "128k",
    "-f", "ogg",
    "pipe:1",
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(stream);

  ytdlp.on("error", (err) => console.error("[yt-dlp] error:", err));
  ffmpeg.on("error", (err) => console.error("[ffmpeg] error:", err));
  ytdlp.stderr.on("data", () => {});
  ffmpeg.stderr.on("data", () => {});

  ytdlp.on("close", (code) => {
    if (code !== 0) stream.destroy(new Error(`yt-dlp cerró con código ${code}`));
  });
  ffmpeg.on("close", () => stream.end());

  return stream;
}

class MusicQueue {
  constructor() {
    this.queue       = [];
    this.history     = []; // para previous
    this.connection  = null;
    this.player      = null;
    this.current     = null;
    this.playing     = false;
    this.paused      = false;
    this.looping     = false;
    this.textChannel = null;
    this.nowPlayingMsg = null; // mensaje del embed
  }

  async connect(msg) {
    const voiceChannel = msg.member?.voice?.channel;
    if (!voiceChannel) throw new Error("Debes estar en un canal de voz.");

    if (this.connection) {
      const currentChannelId = this.connection.joinConfig.channelId;
      if (currentChannelId !== voiceChannel.id) {
        throw new Error(`Ya estoy conectado a <#${currentChannelId}>.`);
      }
      return;
    }

    this.textChannel = msg.channel;

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator,
    });

    await entersState(this.connection, VoiceConnectionStatus.Ready, 10_000);

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await entersState(this.connection, VoiceConnectionStatus.Recovering, 3_000);
      } catch {
        this.destroy();
      }
    });

    this.player = createAudioPlayer();
    this.connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => {
      if (this.looping && this.current) {
        // Si loop está activo, vuelve a poner la canción al inicio
        this.queue.unshift(this.current);
      }
      this.current = null;
      this.playing = false;
      this.paused  = false;
      this._next();
    });

    this.player.on("error", (err) => {
      console.error("[Music] Player error:", err);
      this.textChannel?.send(`❌ Error: ${err.message}`);
      this._next();
    });
  }

  async add(query) {
    const song = await getInfo(query);
    if (!song.url) throw new Error("No se pudo obtener la URL.");
    this.queue.push(song);
    return song;
  }

  async _next() {
    if (!this.queue.length) {
      this.textChannel?.send("✅ Cola vacía, desconectando...");
      await this._deleteNowPlaying();
      setTimeout(() => this.destroy(), 5000);
      return;
    }

    if (this.current) this.history.push(this.current);
    this.current = this.queue.shift();
    this.playing = true;
    this.paused  = false;

    try {
      const stream = createStream(this.current.url);
      const resource = createAudioResource(stream, {
        inputType: StreamType.OggOpus,
      });
      this.player.play(resource);
      await this._sendNowPlaying();
    } catch (err) {
      console.error("[Music] Error al streamear:", err);
      this.textChannel?.send(`❌ Error al reproducir **${this.current.title}**, saltando...`);
      this._next();
    }
  }

  async _sendNowPlaying() {
    await this._deleteNowPlaying();
    const embed = buildMusicEmbed(this.current, this.queue, this.looping, false);
    const buttons = buildMusicButtons(false);
    this.nowPlayingMsg = await this.textChannel?.send({
      embeds: [embed],
      components: buttons,
    });
  }

  async _updateNowPlaying() {
    if (!this.nowPlayingMsg || !this.current) return;
    const embed = buildMusicEmbed(this.current, this.queue, this.looping, false);
    const buttons = buildMusicButtons(this.paused);
    await this.nowPlayingMsg.edit({ embeds: [embed], components: buttons }).catch(() => {});
  }

  async _deleteNowPlaying() {
    if (this.nowPlayingMsg) {
      await this.nowPlayingMsg.delete().catch(() => {});
      this.nowPlayingMsg = null;
    }
  }

  skip() {
    if (!this.playing) throw new Error("No hay nada reproduciéndose.");
    this.looping = false; // al skipear desactiva loop de la canción actual
    this.player.stop();
  }

  async previous() {
    if (!this.history.length) throw new Error("No hay canciones anteriores.");
    const prev = this.history.pop();
    this.queue.unshift(prev);
    if (this.current) this.queue.unshift(this.current);
    this.player.stop();
  }

  pause() {
    if (!this.playing) throw new Error("No hay nada reproduciéndose.");
    if (this.paused) throw new Error("Ya está pausado.");
    this.player.pause();
    this.paused = true;
    this._updateNowPlaying();
  }

  resume() {
    if (!this.paused) throw new Error("No está pausado.");
    this.player.unpause();
    this.paused = false;
    this._updateNowPlaying();
  }

  toggleLoop() {
    this.looping = !this.looping;
    this._updateNowPlaying();
    return this.looping;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this._updateNowPlaying();
  }

  setVolume(amount) {
    this.volume = Math.max(0.1, Math.min(2.0, this.volume + amount));
    return this.volume;
  }

  destroy() {
    this.queue   = [];
    this.history = [];
    this.current = null;
    this.playing = false;
    this.paused  = false;
    this._deleteNowPlaying();
    this.player?.stop();
    this.connection?.destroy();
    this.connection = null;
    this.player     = null;
  }
}

module.exports = { MusicQueue };