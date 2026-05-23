// handlers/commands.js
const fs = require("fs");
const path = require("path");

class CommandHandler {
  constructor(client, prefix) {
    this.client = client;
    this.prefix = prefix;
    this.client.commands = new Map();
    this.client.aliases = new Map();
  }

  load(dirPath) {
    const absPath = path.resolve(dirPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`[Commands] Carpeta "${dirPath}" no encontrada, saltando.`);
      return this;
    }
    this._scan(absPath);
    console.log(`[Commands] ${this.client.commands.size} comandos cargados.`);
    this._listen();
    return this;
  }

  _scan(dirPath) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const full = path.join(dirPath, item);
      fs.statSync(full).isDirectory()
        ? this._scan(full)
        : item.endsWith(".js") && this._register(full);
    }
  }

  _register(filePath) {
    const cmd = require(filePath);
    if (!cmd.name || !cmd.execute) {
      return console.warn(`[Commands] Saltando ${filePath} — falta name o execute.`);
    }
    this.client.commands.set(cmd.name.toLowerCase(), cmd);
    if (Array.isArray(cmd.aliases)) {
      cmd.aliases.forEach((a) =>
        this.client.aliases.set(a.toLowerCase(), cmd.name.toLowerCase())
      );
    }
  }

  _listen() {
    this.client.on("messageCreate", (msg) => {
      if (msg.author.bot || !msg.content.startsWith(this.prefix)) return;

      const originalDelete = msg.delete.bind(msg);
      msg.send   = (content) => msg.channel.send(content);
      msg.delete = () => originalDelete();

      const args = msg.content.slice(this.prefix.length).trim().split(/\s+/);
      const input = args.shift().toLowerCase();
      const name = this.client.aliases.get(input) ?? input;
      const cmd = this.client.commands.get(name);
      if (!cmd) return;
      try {
        cmd.execute(msg, args);
      } catch (err) {
        console.error(`[Commands] Error en "${name}":`, err);
        msg.reply("❌ Hubo un error ejecutando ese comando.");
      }
    });
  }
}

module.exports = { CommandHandler };