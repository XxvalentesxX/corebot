// commands/prefix/moderation/owners/apply.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { errorEmbed }                    = require("../../../../utils/mod");
const {
  isOpen, openPostulations, closePostulations, getApplicant,
  getGeneralQuestions, getCategoryQuestions,
} = require("../../../../utils/apply");
const { createApplyChannel }            = require("../../../../systems/apply");
const APPLY_CONFIG                      = require("../../../../config/apply");
const { OWNERS }                        = require("../../../../config");
const fs   = require("fs");
const path = require("path");

const ADMIN_ROLE = "1309303092952563725";

function isAdmin(member) {
  return OWNERS.includes(member.id) || member.roles.cache.has(ADMIN_ROLE) || member.permissions.has("Administrator");
}

// ── Persistencia de preguntas editadas desde el panel ──────────────────────
const QUESTIONS_PATH = path.join(process.cwd(), "data", "apply_questions.json");

function loadQFile() {
  if (!fs.existsSync(QUESTIONS_PATH)) return { general: null, categories: {} };
  try { return JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf-8")); }
  catch { return { general: null, categories: {} }; }
}

function saveQFile(data) {
  fs.mkdirSync(path.dirname(QUESTIONS_PATH), { recursive: true });
  fs.writeFileSync(QUESTIONS_PATH, JSON.stringify(data, null, 2));
}

function setGeneralQuestions(questions) {
  const data = loadQFile();
  data.general = questions;
  saveQFile(data);
}

function setCategoryQuestions(catId, questions) {
  const data = loadQFile();
  if (!data.categories) data.categories = {};
  data.categories[catId] = questions;
  saveQFile(data);
}

function formatMs(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m${s > 0 ? ` ${s}s` : ""}` : `${s}s`;
}

// ── Embeds del panel ────────────────────────────────────────────────────────
function embedHome() {
  const open     = isOpen();
  const genCount = getGeneralQuestions().length;
  const catLines = APPLY_CONFIG.categories.map((c) => {
    const count = getCategoryQuestions(c.id).length;
    return `${c.isOther ? "🔘" : "🔷"} **${c.label}** — ${count} preguntas`;
  }).join("\n");

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📋 Panel de Postulaciones")
    .addFields(
      { name: "Estado",              value: open ? "🟢 Abiertas" : "🔴 Cerradas",       inline: true },
      { name: "Preguntas generales", value: `${genCount} preguntas`,                     inline: true },
      { name: "\u200b",              value: "\u200b",                                     inline: true },
      { name: "Categorías",          value: catLines || "*Sin categorías en config*",     inline: false },
    )
    .setFooter({ text: "Las categorías se editan en config/apply.js" })
    .setTimestamp();
}

function rowHome(open) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ap_toggle")
      .setLabel(open ? "🔴 Cerrar postulaciones" : "🟢 Abrir postulaciones")
      .setStyle(open ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ap_general")
      .setLabel("📝 Preguntas generales")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ap_categories")
      .setLabel("🔷 Preguntas por categoría")
      .setStyle(ButtonStyle.Primary),
  );
}

function rowBack() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ap_home").setLabel("← Volver").setStyle(ButtonStyle.Secondary)
  );
}

// ── Lista de preguntas generales ────────────────────────────────────────────
function embedGeneralList() {
  const questions = getGeneralQuestions();
  const lines = questions.length
    ? questions.map((q, i) => `**${i + 1}.** ${q.text} *(${formatMs(q.timeMs ?? APPLY_CONFIG.DEFAULT_QUESTION_TIME_MS)})*`).join("\n")
    : "*No hay preguntas generales configuradas.*";

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Preguntas Generales")
    .setDescription(lines.length > 4000 ? lines.slice(0, 4000) + "..." : lines)
    .setFooter({ text: `${questions.length} preguntas` })
    .setTimestamp();
}

function rowGeneralActions(hasQuestions) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ap_gen_add").setLabel("➕ Agregar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ap_gen_remove").setLabel("🗑️ Quitar").setStyle(ButtonStyle.Danger).setDisabled(!hasQuestions),
    new ButtonBuilder().setCustomId("ap_home").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );
}

// ── Select de categorías ────────────────────────────────────────────────────
function embedCategorySelect() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔷 Preguntas por Categoría")
    .setDescription("Elegí una categoría para ver y editar sus preguntas.");
}

function rowCategorySelect() {
  const options = APPLY_CONFIG.categories.map((c) => ({
    label:       c.label,
    description: `${getCategoryQuestions(c.id).length} preguntas${c.isOther ? " · Solo 1 se usa" : ""}`,
    value:       c.id,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ap_cat_select")
      .setPlaceholder("Seleccioná una categoría...")
      .addOptions(options)
  );
}

// ── Lista de preguntas de una categoría ────────────────────────────────────
function embedCategoryList(catId) {
  const cat       = APPLY_CONFIG.categories.find((c) => c.id === catId);
  const questions = getCategoryQuestions(catId);
  const lines     = questions.length
    ? questions.map((q, i) => `**${i + 1}.** ${q.text} *(${formatMs(q.timeMs ?? APPLY_CONFIG.DEFAULT_QUESTION_TIME_MS)})*`).join("\n")
    : "*No hay preguntas para esta categoría.*";

  return new EmbedBuilder()
    .setColor(0x7b2fbe)
    .setTitle(`🔷 ${cat?.embedTitle ?? catId}${cat?.isOther ? " (solo 1 pregunta se usa)" : ""}`)
    .setDescription(lines.length > 4000 ? lines.slice(0, 4000) + "..." : lines)
    .setFooter({ text: `${questions.length} preguntas` })
    .setTimestamp();
}

function rowCategoryActions(catId, hasQuestions) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap_cat_add:${catId}`).setLabel("➕ Agregar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ap_cat_remove:${catId}`).setLabel("🗑️ Quitar").setStyle(ButtonStyle.Danger).setDisabled(!hasQuestions),
    new ButtonBuilder().setCustomId("ap_categories").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );
}

// ── Modales ─────────────────────────────────────────────────────────────────
function modalAddQuestion(customId, title) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("text")
          .setLabel("Texto de la pregunta")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(300)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("time")
          .setLabel("Tiempo límite (ej: 30s, 1m, 2m30s)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("Dejar vacío = 60s")
          .setMaxLength(10)
      ),
    );
}

function parseTimeInput(str) {
  if (!str?.trim()) return 60_000;
  const clean = str.trim().toLowerCase();
  // "2m30s", "90s", "2m", "1min"
  let ms = 0;
  const mMatch = clean.match(/(\d+)\s*m(?:in)?/);
  const sMatch = clean.match(/(\d+)\s*s/);
  if (mMatch) ms += parseInt(mMatch[1]) * 60_000;
  if (sMatch) ms += parseInt(sMatch[1]) * 1_000;
  if (!mMatch && !sMatch) {
    const num = parseInt(clean);
    if (!isNaN(num)) ms = num * 1_000;
  }
  return ms > 0 ? ms : 60_000;
}

// ── Comando ──────────────────────────────────────────────────────────────────
module.exports = {
  name: "apply",
  aliases: ["aplicaciones", "postulaciones"],
  description: "Panel de administración de postulaciones",

  async execute(msg, args) {
    // ── Subcomando: iniciar apply de un usuario ───────────────────────────
    // c?apply start @usuario  (lo usa el bot internamente o un admin)
    if (args[0] === "start" && msg.mentions.users.size) {
      if (!isAdmin(msg.member))
        return msg.reply({ embeds: [errorEmbed("Sin permisos.")] });
      const target = msg.mentions.users.first();
      const applicant = getApplicant(target.id);
      if (applicant?.status === "pending")
        return msg.reply({ embeds: [errorEmbed(`${target} ya tiene una postulación en curso.`)] });
      if (!isOpen())
        return msg.reply({ embeds: [errorEmbed("Las postulaciones están cerradas.")] });
      const channel = await createApplyChannel(msg.guild, target.id);
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setDescription(`✅ Canal creado: ${channel}`)] });
    }

    // ── Panel de administración ───────────────────────────────────────────
    if (!isAdmin(msg.member))
      return msg.reply({ embeds: [errorEmbed("Solo **Owners** y **Admins** pueden usar el panel de postulaciones.")] });

    const s = { mode: "home", currentCat: null };

    const panel = await msg.reply({
      embeds:     [embedHome()],
      components: [rowHome(isOpen())],
    });

    async function render(interaction) {
      const doUpdate = (data) => interaction ? interaction.update(data) : panel.edit(data);

      switch (s.mode) {
        case "home":
          return doUpdate({ embeds: [embedHome()], components: [rowHome(isOpen())] });

        case "general": {
          const qs = getGeneralQuestions();
          return doUpdate({ embeds: [embedGeneralList()], components: [rowGeneralActions(qs.length > 0)] });
        }

        case "categories":
          return doUpdate({ embeds: [embedCategorySelect()], components: [rowCategorySelect(), rowBack()] });

        case "cat_detail": {
          const qs = getCategoryQuestions(s.currentCat);
          return doUpdate({ embeds: [embedCategoryList(s.currentCat)], components: [rowCategoryActions(s.currentCat, qs.length > 0)] });
        }
      }
    }

    // ── Collectors ────────────────────────────────────────────────────────
    const btnCollector = panel.createMessageComponentCollector({
      filter: (i) => i.user.id === msg.author.id && i.isButton(),
      time: 180_000,
    });

    const selCollector = panel.createMessageComponentCollector({
      filter: (i) => i.user.id === msg.author.id && i.isStringSelectMenu(),
      time: 180_000,
    });

    btnCollector.on("collect", async (i) => {
      switch (i.customId) {
        case "ap_home":
          s.mode = "home";
          return render(i);

        case "ap_toggle": {
          if (isOpen()) closePostulations(); else openPostulations();
          s.mode = "home";
          return render(i);
        }

        case "ap_general":
          s.mode = "general";
          return render(i);

        case "ap_categories":
          s.mode = "categories";
          return render(i);

        // ── Agregar pregunta general ──────────────────────────────────────
        case "ap_gen_add":
          return i.showModal(modalAddQuestion("ap_modal_gen_add", "Agregar pregunta general"));

        // ── Quitar pregunta general ───────────────────────────────────────
        case "ap_gen_remove": {
          const qs = getGeneralQuestions();
          if (!qs.length) return i.reply({ embeds: [errorEmbed("No hay preguntas para quitar.")], ephemeral: true });

          const options = qs.slice(0, 25).map((q, idx) => ({
            label:       `${idx + 1}. ${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}`,
            value:       String(idx),
          }));

          await i.update({
            embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🗑️ Quitar pregunta general").setDescription("Elegí cuál querés eliminar.")],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId("ap_gen_remove_select")
                  .setPlaceholder("Seleccioná la pregunta a eliminar...")
                  .addOptions(options)
              ),
              rowBack(),
            ],
          });
          return;
        }

        // ── Agregar pregunta de categoría ─────────────────────────────────
        default: {
          if (i.customId.startsWith("ap_cat_add:")) {
            const catId = i.customId.split(":")[1];
            s.currentCat = catId;
            const cat = APPLY_CONFIG.categories.find((c) => c.id === catId);
            return i.showModal(modalAddQuestion(`ap_modal_cat_add:${catId}`, `Agregar pregunta — ${cat?.label ?? catId}`));
          }

          // ── Quitar pregunta de categoría ────────────────────────────────
          if (i.customId.startsWith("ap_cat_remove:")) {
            const catId = i.customId.split(":")[1];
            s.currentCat = catId;
            const qs = getCategoryQuestions(catId);
            if (!qs.length) return i.reply({ embeds: [errorEmbed("No hay preguntas para quitar.")], ephemeral: true });

            const options = qs.slice(0, 25).map((q, idx) => ({
              label: `${idx + 1}. ${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}`,
              value: String(idx),
            }));

            await i.update({
              embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`🗑️ Quitar pregunta — ${APPLY_CONFIG.categories.find((c) => c.id === catId)?.label ?? catId}`).setDescription("Elegí cuál querés eliminar.")],
              components: [
                new ActionRowBuilder().addComponents(
                  new StringSelectMenuBuilder()
                    .setCustomId(`ap_cat_remove_select:${catId}`)
                    .setPlaceholder("Seleccioná la pregunta a eliminar...")
                    .addOptions(options)
                ),
                rowBack(),
              ],
            });
            return;
          }
        }
      }
    });

    selCollector.on("collect", async (i) => {
      // ── Selección de categoría ──────────────────────────────────────────
      if (i.customId === "ap_cat_select") {
        s.currentCat = i.values[0];
        s.mode = "cat_detail";
        return render(i);
      }

      // ── Eliminar pregunta general ───────────────────────────────────────
      if (i.customId === "ap_gen_remove_select") {
        const idx = parseInt(i.values[0]);
        const qs  = getGeneralQuestions();
        qs.splice(idx, 1);
        setGeneralQuestions(qs);
        s.mode = "general";
        await i.update({
          embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Pregunta eliminada.")],
          components: [],
        });
        setTimeout(() => render(null), 1500);
        return;
      }

      // ── Eliminar pregunta de categoría ──────────────────────────────────
      if (i.customId.startsWith("ap_cat_remove_select:")) {
        const catId = i.customId.split(":")[1];
        const idx   = parseInt(i.values[0]);
        const qs    = getCategoryQuestions(catId);
        qs.splice(idx, 1);
        setCategoryQuestions(catId, qs);
        s.mode = "cat_detail";
        s.currentCat = catId;
        await i.update({
          embeds: [new EmbedBuilder().setColor(0x57f287).setDescription("✅ Pregunta eliminada.")],
          components: [],
        });
        setTimeout(() => render(null), 1500);
        return;
      }
    });

    // ── Listener de modales ───────────────────────────────────────────────
    const modalListener = async (i) => {
      if (!i.isModalSubmit()) return;
      if (i.user.id !== msg.author.id) return;

      // Verificar que sea un modal de este panel ANTES de leer fields
      if (!["ap_modal_gen_add", "ap_modal_cat_add"].includes(i.customId) &&
          !i.customId.startsWith("ap_modal_cat_add:")) return;

      const text    = i.fields.getTextInputValue("text").trim();
      const timeRaw = i.fields.getTextInputValue("time");
      const timeMs  = parseTimeInput(timeRaw);

      // Agregar pregunta general
      if (i.customId === "ap_modal_gen_add") {
        const qs = getGeneralQuestions();
        qs.push({ text, timeMs });
        setGeneralQuestions(qs);
        s.mode = "general";
        await i.deferUpdate().catch(() => {});
        render(null);
        return;
      }

      // Agregar pregunta de categoría
      if (i.customId.startsWith("ap_modal_cat_add:")) {
        const catId = i.customId.split(":")[1];
        const qs    = getCategoryQuestions(catId);
        qs.push({ text, timeMs });
        setCategoryQuestions(catId, qs);
        s.mode       = "cat_detail";
        s.currentCat = catId;
        await i.deferUpdate().catch(() => {});
        render(null);
        return;
      }
    };

    msg.client.on("interactionCreate", modalListener);

    btnCollector.on("end", () => {
      msg.client.off("interactionCreate", modalListener);
      panel.edit({ components: [] }).catch(() => {});
    });
  },
};