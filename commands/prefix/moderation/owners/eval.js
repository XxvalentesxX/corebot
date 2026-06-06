// commands/prefix/moderation/owners/eval.js
const { EmbedBuilder } = require("discord.js");
const { OWNERS }       = require("../../../../config");
const util             = require("util");

function truncate(str, max = 1900) {
  if (str.length <= max) return str;
  return str.slice(0, max) + `\n…(truncado, ${str.length - max} chars más)`;
}

function clean(text, token) {
  return typeof text === "string" ? text.replaceAll(token, "[TOKEN]") : text;
}

module.exports = {
  name: "eval",
  aliases: ["ev"],
  description: "Evalúa código JavaScript (solo Owners)",

  async execute(msg, args) {
    if (!OWNERS.includes(msg.author.id)) return;

    const code = msg.content
      .slice(msg.content.indexOf(" ") + 1)
      .replace(/^```(?:js|javascript)?\n?/, "")
      .replace(/```$/, "")
      .trim();

    if (!code)
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("**Uso:** `c?eval <código>`")],
      });

    const inputEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📥 Input")
      .setDescription(`\`\`\`js\n${truncate(code, 1800)}\n\`\`\``)
      .setTimestamp();

    const inputMsg = await msg.reply({ embeds: [inputEmbed] });

    // ── Captura de console ────────────────────────────────────────────────
    const logs  = [];
    const _log  = console.log;
    const _warn = console.warn;
    const _err  = console.error;

    const capture = (level, original) => (...a) => {
      original(...a);
      logs.push({
        level,
        text: a.map((x) => (typeof x === "string" ? x : util.inspect(x, { depth: 2 }))).join(" "),
      });
    };

    console.log   = capture("log",   _log);
    console.warn  = capture("warn",  _warn);
    console.error = capture("error", _err);

    // ── Ejecutar con new Function (evita conflictos de scope con eval) ────
    let output;
    let isError = false;
    const start = Date.now();

    try {
      // new Function crea un scope limpio; async permite await y let/const
      const fn     = new Function("require", "msg", "util", `return (async () => { ${code} })()`);
      const result = await fn(require, msg, util);

      output = clean(
        typeof result === "string" ? result : util.inspect(result, { depth: 2 }),
        msg.client.token
      );
    } catch (e) {
      isError = true;
      output  = clean(e.stack || e.toString(), msg.client.token);
    } finally {
      console.log   = _log;
      console.warn  = _warn;
      console.error = _err;
    }

    const elapsed = Date.now() - start;

    // ── Embeds ────────────────────────────────────────────────────────────
    const embeds = [inputEmbed];

    embeds.push(
      new EmbedBuilder()
        .setColor(isError ? 0xed4245 : 0x57f287)
        .setTitle(isError ? "❌ Output — Error" : "✅ Output — Success")
        .setDescription(`\`\`\`js\n${truncate(output, 1800)}\n\`\`\``)
        .setFooter({ text: `Tiempo: ${elapsed}ms · Tipo: ${isError ? "Error" : typeof output}` })
        .setTimestamp()
    );

    if (logs.length) {
      const icon  = { log: "⬜", warn: "🟡", error: "🔴" };
      const lines = logs.map((l) => `${icon[l.level] ?? "⬜"} ${clean(truncate(l.text, 300), msg.client.token)}`);

      embeds.push(
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle(`🖥️ Console (${logs.length} ${logs.length === 1 ? "entrada" : "entradas"})`)
          .setDescription(truncate(lines.join("\n"), 1900))
          .setTimestamp()
      );
    }

    await inputMsg.edit({ embeds });
  },
};