// commands/prefix/tickets/apply.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const { load, save, openPostulations, closePostulations, getApplicant } = require("../../../utils/apply");
const { createApplyChannel } = require("../../../systems/apply");
const { OWNERS } = require("../../../config");
const { randomUUID } = require("crypto");

const STAFF_ZONE_ROLE = "1309303771087638590";

function canUse(member) {
  return OWNERS.includes(member.id) || member.permissions.has("Administrator");
}

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

function parseMs(str) {
  const match = str.match(/^(\d+)(s|min|m|h)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const u = match[2].toLowerCase();
  const map = { s: 1000, m: 60000, min: 60000, h: 3600000 };
  return n * (map[u] ?? 0);
}

// ── Panel principal ────────────────────────────────────────────────────────
async function showMain(embedMsg) {
  const config = load();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Panel de Postulaciones — CoreCM")
    .addFields(
      { name: "Estado", value: config.open ? "✅ Postulaciones abiertas" : "❌ Postulaciones cerradas", inline: true },
      { name: "Preguntas", value: `${config.questions.length} configuradas`, inline: true },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ap_toggle")
      .setLabel(config.open ? "🔒 Cerrar postulaciones" : "🔓 Abrir postulaciones")
      .setStyle(config.open ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ap_questions")
      .setLabel("📝 Ver / editar preguntas")
      .setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1] });
}

// ── Panel preguntas ────────────────────────────────────────────────────────
async function showQuestions(embedMsg) {
  const config = load();

  const qList = config.questions.length
    ? config.questions.map((q, i) => `**${i + 1}.** ${q.text}\n⏱️ ${formatMs(q.timeMs)}`).join("\n\n")
    : "No hay preguntas configuradas.";

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Preguntas de Postulación")
    .setDescription(qList.length > 4000 ? qList.slice(0, 4000) : qList)
    .setFooter({ text: `${config.questions.length} preguntas` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ap_q_add").setLabel("➕ Agregar pregunta").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ap_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  const rows = [row1];

  if (config.questions.length) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ap_q_select")
        .setPlaceholder("Selecciona una pregunta para editar o eliminar")
        .addOptions(config.questions.map((q, i) => ({
          label: `${i + 1}. ${q.text.slice(0, 80)}`,
          value: q.id,
          description: `⏱️ ${formatMs(q.timeMs)}`,
        }))),
    ));
  }

  await embedMsg.edit({ embeds: [embed], components: rows });
}

// ── Detalle de pregunta ────────────────────────────────────────────────────
async function showQuestion(embedMsg, qId) {
  const config = load();
  const q = config.questions.find((q) => q.id === qId);
  if (!q) return showQuestions(embedMsg);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Pregunta")
    .addFields(
      { name: "Texto", value: q.text },
      { name: "Tiempo límite", value: formatMs(q.timeMs), inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap_q_edit:${qId}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap_q_edittime:${qId}`).setLabel("⏱️ Cambiar tiempo").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ap_q_delete:${qId}`).setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ap_questions").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row] });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function askReply(channel, authorId, timeout = 60_000) {
  return new Promise((resolve) => {
    const collector = channel.createMessageCollector({
      filter: (m) => m.author.id === authorId,
      time: timeout,
      max: 1,
    });
    collector.on("collect", async (m) => { await m.delete().catch(() => {}); resolve(m.content); });
    collector.on("end", (_, reason) => { if (reason === "time") resolve(null); });
  });
}

// ── Comando ────────────────────────────────────────────────────────────────
module.exports = {
  name: "apply",
  aliases: ["ap"],
  description: "Panel de configuración de postulaciones.",
  async execute(msg, args) {
    if (!canUse(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tenés permisos para usar este comando.")] });

    const embedMsg = await msg.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("⏳ Cargando panel...")],
      fetchReply: true,
    });

    await showMain(embedMsg);

    const collector = embedMsg.createMessageComponentCollector({
      time: 180_000,
      filter: (i) => i.user.id === msg.author.id,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      const config = load();
      const id = i.customId;

      if (id === "ap_back")      return showMain(embedMsg);
      if (id === "ap_questions") return showQuestions(embedMsg);

      // Toggle abrir/cerrar
      if (id === "ap_toggle") {
        if (config.open) {
          closePostulations();
        } else {
          openPostulations();
        }
        return showMain(embedMsg);
      }

      // Agregar pregunta
      if (id === "ap_q_add") {
        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Escribí el texto de la pregunta.\nEscribí `cancelar` para cancelar.")],
          components: [],
        });
        const text = await askReply(msg.channel, msg.author.id);
        if (!text || text.toLowerCase() === "cancelar") return showQuestions(embedMsg);

        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("¿Cuánto tiempo tendrá para responder? (ej: `30s`, `1m`, `2m30s` no soportado — usá `150s`)\nEscribí `cancelar` para cancelar.")],
          components: [],
        });
        const timeStr = await askReply(msg.channel, msg.author.id);
        if (!timeStr || timeStr.toLowerCase() === "cancelar") return showQuestions(embedMsg);

        const timeMs = parseMs(timeStr);
        if (!timeMs) {
          await embedMsg.edit({ embeds: [errorEmbed("Formato inválido. Usá: `30s`, `1m`, `2m`, `1h`")], components: [] });
          return setTimeout(() => showQuestions(embedMsg), 2000);
        }

        const newQ = { id: randomUUID().slice(0, 8), text, timeMs };
        config.questions.push(newQ);
        save(config);
        return showQuestions(embedMsg);
      }

      // Seleccionar pregunta
      if (id === "ap_q_select") {
        return showQuestion(embedMsg, i.values[0]);
      }

      // Editar texto
      if (id.startsWith("ap_q_edit:")) {
        const qId = id.split(":")[1];
        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Escribí el nuevo texto de la pregunta.\nEscribí `cancelar` para cancelar.")],
          components: [],
        });
        const text = await askReply(msg.channel, msg.author.id);
        if (!text || text.toLowerCase() === "cancelar") return showQuestion(embedMsg, qId);
        const q = config.questions.find((q) => q.id === qId);
        if (q) { q.text = text; save(config); }
        return showQuestion(embedMsg, qId);
      }

      // Editar tiempo
      if (id.startsWith("ap_q_edittime:")) {
        const qId = id.split(":")[1];
        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Escribí el nuevo tiempo (ej: `30s`, `1m`, `2m`).\nEscribí `cancelar` para cancelar.")],
          components: [],
        });
        const timeStr = await askReply(msg.channel, msg.author.id);
        if (!timeStr || timeStr.toLowerCase() === "cancelar") return showQuestion(embedMsg, qId);
        const timeMs = parseMs(timeStr);
        if (!timeMs) {
          await embedMsg.edit({ embeds: [errorEmbed("Formato inválido.")], components: [] });
          return setTimeout(() => showQuestion(embedMsg, qId), 2000);
        }
        const q = config.questions.find((q) => q.id === qId);
        if (q) { q.timeMs = timeMs; save(config); }
        return showQuestion(embedMsg, qId);
      }

      // Eliminar pregunta
      if (id.startsWith("ap_q_delete:")) {
        const qId = id.split(":")[1];
        config.questions = config.questions.filter((q) => q.id !== qId);
        save(config);
        return showQuestions(embedMsg);
      }
    });

    collector.on("end", async () => {
      await embedMsg.edit({ components: [] }).catch(() => {});
    });
  },
};