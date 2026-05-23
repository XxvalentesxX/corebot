// commands/prefix/moderation/automod.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const { errorEmbed, formatDuration } = require("../../../../utils/mod");
const { loadAutomod, saveAutomod } = require("../../../../systems/automod");
const { OWNERS } = require("../../../../config");
const { randomUUID } = require("crypto");

function canUse(member) {
  return OWNERS.includes(member.id) || member.permissions.has("Administrator");
}

function formatMs(ms) {
  if (!ms) return "Permanente";
  const units = [
    [3_600_000, "h"],
    [60_000, "min"],
    [1_000, "s"],
  ];
  const parts = [];
  let r = ms;
  for (const [u, label] of units) {
    const n = Math.floor(r / u);
    if (n) { parts.push(`${n}${label}`); r -= n * u; }
  }
  return parts.join(" ") || "<1s";
}

function parseMs(str) {
  const match = str.match(/^(\d+)(s|min|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const u = match[2].toLowerCase();
  const map = { s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (map[u] ?? 0);
}

// ── Paneles ────────────────────────────────────────────────────────────────

async function showMain(embedMsg, authorId) {
  const config = loadAutomod();

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🤖 Panel Automod")
    .addFields(
      { name: "Estado global", value: config.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Antiflood", value: config.antiflood.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Antispam (links)", value: config.antispam.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Antipalabras", value: config.antiwords.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Anti-ghost ping", value: config.antighost?.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_toggle").setLabel(config.enabled ? "Desactivar todo" : "Activar todo").setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_flood").setLabel("🌊 Antiflood").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("am_spam").setLabel("🔗 Antispam").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("am_words").setLabel("🤬 Antipalabras").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("am_ghost").setLabel("👻 Anti-ghost").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row] });
}

async function showFlood(embedMsg) {
  const { antiflood: cfg } = loadAutomod();

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🌊 Antiflood")
    .addFields(
      { name: "Estado", value: cfg.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Mensajes iguales seguidos", value: `${cfg.repeatedCount}`, inline: true },
      { name: "Mensajes en ráfaga", value: `${cfg.burstCount} en ${cfg.burstWindow / 1000}s`, inline: true },
      { name: "Advertencias antes de mutear", value: `${cfg.warnLimit}`, inline: true },
      { name: "Reset de advertencias", value: formatMs(cfg.warnResetMs), inline: true },
      { name: "Duración del mute", value: formatMs(cfg.muteDurationMs), inline: true },
    )
    .setFooter({ text: "Usa los botones para modificar cada valor" })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_flood_toggle").setLabel(cfg.enabled ? "Desactivar" : "Activar").setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_flood_repeated").setLabel("✏️ Mensajes iguales").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_flood_burst").setLabel("✏️ Ráfaga").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_flood_warnlimit").setLabel("✏️ Advertencias").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_flood_warnreset").setLabel("✏️ Reset de advertencias").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_flood_mute").setLabel("✏️ Duración mute").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1, row2] });
}

async function showSpam(embedMsg) {
  const { antispam: cfg } = loadAutomod();

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🔗 Antispam — Links")
    .addFields(
      { name: "Estado", value: cfg.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Advertencias antes de mutear", value: `${cfg.warnLimit}`, inline: true },
      { name: "Reset de advertencias", value: formatMs(cfg.warnResetMs), inline: true },
      { name: "Duración del mute", value: formatMs(cfg.muteDurationMs), inline: true },
      {
        name: `Dominios permitidos (${cfg.allowedDomains.length})`,
        value: cfg.allowedDomains.length ? cfg.allowedDomains.map((d) => `\`${d}\``).join(", ") : "Ninguno",
      },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_spam_toggle").setLabel(cfg.enabled ? "Desactivar" : "Activar").setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_spam_warnlimit").setLabel("✏️ Advertencias").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_spam_warnreset").setLabel("✏️ Reset adv.").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_spam_mute").setLabel("✏️ Duración mute").setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_spam_domain_add").setLabel("➕ Permitir dominio").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_spam_domain_remove").setLabel("➖ Quitar dominio").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("am_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1, row2] });
}

async function showWords(embedMsg) {
  const { antiwords: cfg } = loadAutomod();

  const groupList = cfg.groups.length
    ? cfg.groups.map((g) => `${g.enabled ? "✅" : "❌"} **${g.name}** — ${g.words.length} palabras — Mute: ${formatMs(g.muteDurationMs)} — Adv: ${g.warnLimit}`).join("\n")
    : "No hay grupos creados.";

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🤬 Antipalabras")
    .addFields(
      { name: "Estado", value: cfg.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Grupos de palabras", value: groupList },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_words_toggle").setLabel(cfg.enabled ? "Desactivar" : "Activar").setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_words_newgroup").setLabel("➕ Nuevo grupo").setStyle(ButtonStyle.Success),
  );

  const rows = [row1];

  if (cfg.groups.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("am_words_select_group")
      .setPlaceholder("Selecciona un grupo para editar")
      .addOptions(cfg.groups.map((g) => ({ label: g.name, value: g.id, description: `${g.words.length} palabras — Mute: ${formatMs(g.muteDurationMs)}` })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  ));

  await embedMsg.edit({ embeds: [embed], components: rows });
}

async function showGroup(embedMsg, groupId) {
  const config = loadAutomod();
  const group = config.antiwords.groups.find((g) => g.id === groupId);
  if (!group) return;

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🤬 Grupo: ${group.name}`)
    .addFields(
      { name: "Estado", value: group.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Advertencias antes de mutear", value: `${group.warnLimit}`, inline: true },
      { name: "Reset de advertencias", value: formatMs(group.warnResetMs), inline: true },
      { name: "Duración del mute", value: formatMs(group.muteDurationMs), inline: true },
      { name: `Palabras (${group.words.length})`, value: group.words.length ? group.words.map((w) => `\`${w}\``).join(", ") : "Ninguna" },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`am_grp_toggle:${groupId}`).setLabel(group.enabled ? "Desactivar" : "Activar").setStyle(group.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`am_grp_addwords:${groupId}`).setLabel("➕ Agregar palabras").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`am_grp_removeword:${groupId}`).setLabel("➖ Quitar palabra").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`am_grp_warnlimit:${groupId}`).setLabel("✏️ Advertencias").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`am_grp_warnreset:${groupId}`).setLabel("✏️ Reset adv.").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`am_grp_mute:${groupId}`).setLabel("✏️ Duración mute").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`am_grp_delete:${groupId}`).setLabel("🗑️ Eliminar grupo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("am_words").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1, row2] });
}

async function showGhost(embedMsg) {
  const config = loadAutomod();
  const cfg = config.antighost ?? { enabled: true, warnLimit: 3, warnResetMs: 3_600_000, muteDurationMs: 1_200_000 };

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("👻 Anti-Ghost Ping")
    .setDescription("Detecta cuando alguien menciona a un miembro del staff y borra el mensaje, o edita un mensaje quitando la mención.")
    .addFields(
      { name: "Estado", value: cfg.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Advertencias antes de mutear", value: `${cfg.warnLimit}`, inline: true },
      { name: "Reset de advertencias", value: formatMs(cfg.warnResetMs), inline: true },
      { name: "Duración del mute", value: formatMs(cfg.muteDurationMs), inline: true },
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("am_ghost_toggle").setLabel(cfg.enabled ? "Desactivar" : "Activar").setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("am_ghost_warnlimit").setLabel("✏️ Advertencias").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_ghost_warnreset").setLabel("✏️ Reset adv.").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_ghost_mute").setLabel("✏️ Duración mute").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("am_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1] });
}


function askReply(channel, authorId, prompt, timeout = 30_000) {
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
  name: "automod",
  aliases: ["am"],
  description: "Panel de configuración del automod",
  async execute(msg, args) {
    if (!canUse(msg.member))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const embedMsg = await msg.reply({
      embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("⏳ Cargando panel...")],
      fetchReply: true,
    });

    await showMain(embedMsg, msg.author.id);

    const collector = embedMsg.createMessageComponentCollector({
      time: 180_000,
      filter: (i) => i.user.id === msg.author.id,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      const config = loadAutomod();
      const id = i.customId;

      // ── Navegación ─────────────────────────────────────────
      if (id === "am_back")         return showMain(embedMsg, msg.author.id);
      if (id === "am_flood")        return showFlood(embedMsg);
      if (id === "am_spam")         return showSpam(embedMsg);
      if (id === "am_words")        return showWords(embedMsg);
      if (id === "am_ghost")        return showGhost(embedMsg);

      // ── Toggles globales ───────────────────────────────────
      if (id === "am_toggle")       { config.enabled = !config.enabled; saveAutomod(config); return showMain(embedMsg, msg.author.id); }
      if (id === "am_flood_toggle") { config.antiflood.enabled = !config.antiflood.enabled; saveAutomod(config); return showFlood(embedMsg); }
      if (id === "am_spam_toggle")  { config.antispam.enabled = !config.antispam.enabled; saveAutomod(config); return showSpam(embedMsg); }
      if (id === "am_words_toggle") { config.antiwords.enabled = !config.antiwords.enabled; saveAutomod(config); return showWords(embedMsg); }
      if (id === "am_ghost_toggle") {
        if (!config.antighost) config.antighost = { enabled: true, warnLimit: 3, warnResetMs: 3_600_000, muteDurationMs: 1_200_000 };
        config.antighost.enabled = !config.antighost.enabled;
        saveAutomod(config);
        return showGhost(embedMsg);
      }

      // ── Helpers para pedir número o tiempo ────────────────
      async function askNumber(prompt, min, max, onValid) {
        await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription(prompt)], components: [] });
        const reply = await askReply(msg.channel, msg.author.id, prompt);
        if (!reply || reply.toLowerCase() === "cancelar") return;
        const n = parseInt(reply);
        if (!n || n < min || n > max) {
          await embedMsg.edit({ embeds: [errorEmbed(`Número inválido. Debe ser entre ${min} y ${max}.`)], components: [] });
          return setTimeout(() => onValid(null), 2000);
        }
        onValid(n);
      }

      async function askTime(prompt, onValid) {
        await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription(prompt)], components: [] });
        const reply = await askReply(msg.channel, msg.author.id, prompt);
        if (!reply || reply.toLowerCase() === "cancelar") return;
        const ms = parseMs(reply);
        if (!ms) {
          await embedMsg.edit({ embeds: [errorEmbed("Formato inválido. Usa: `30s`, `5min`, `1h`, `1d`")], components: [] });
          return setTimeout(() => onValid(null), 2000);
        }
        onValid(ms);
      }

      // ── Antiflood: editar valores ──────────────────────────
      if (id === "am_flood_repeated") {
        return askNumber("¿Cuántos mensajes iguales seguidos antes de advertir? (2–10)\nEscribe `cancelar` para cancelar.", 2, 10, (n) => {
          if (n) { config.antiflood.repeatedCount = n; saveAutomod(config); }
          showFlood(embedMsg);
        });
      }
      if (id === "am_flood_burst") {
        return askNumber("¿Cuántos mensajes en ráfaga? (2–20)\nEscribe `cancelar` para cancelar.", 2, 20, async (n) => {
          if (!n) return showFlood(embedMsg);
          config.antiflood.burstCount = n;
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("¿En cuántos segundos? (1–30)\nEscribe `cancelar` para cancelar.")], components: [] });
          const reply2 = await askReply(msg.channel, msg.author.id, "");
          if (!reply2 || reply2.toLowerCase() === "cancelar") return showFlood(embedMsg);
          const secs = parseInt(reply2);
          if (!secs || secs < 1 || secs > 30) {
            await embedMsg.edit({ embeds: [errorEmbed("Número inválido. Debe ser entre 1 y 30.")], components: [] });
            return setTimeout(() => showFlood(embedMsg), 2000);
          }
          config.antiflood.burstWindow = secs * 1000;
          saveAutomod(config);
          showFlood(embedMsg);
        });
      }
      if (id === "am_flood_warnlimit") {
        return askNumber("¿Cuántas advertencias antes del mute? (1–10)\nEscribe `cancelar` para cancelar.", 1, 10, (n) => {
          if (n) { config.antiflood.warnLimit = n; saveAutomod(config); }
          showFlood(embedMsg);
        });
      }
      if (id === "am_flood_warnreset") {
        return askTime("¿Cada cuánto se resetean las advertencias? (ej: `30min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { config.antiflood.warnResetMs = ms; saveAutomod(config); }
          showFlood(embedMsg);
        });
      }
      if (id === "am_flood_mute") {
        return askTime("¿Cuánto dura el mute por flood? (ej: `20min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { config.antiflood.muteDurationMs = ms; saveAutomod(config); }
          showFlood(embedMsg);
        });
      }

      // ── Antispam: editar valores ───────────────────────────
      if (id === "am_spam_warnlimit") {
        return askNumber("¿Cuántas advertencias antes del mute? (1–10)\nEscribe `cancelar` para cancelar.", 1, 10, (n) => {
          if (n) { config.antispam.warnLimit = n; saveAutomod(config); }
          showSpam(embedMsg);
        });
      }
      if (id === "am_spam_warnreset") {
        return askTime("¿Cada cuánto se resetean las advertencias? (ej: `30min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { config.antispam.warnResetMs = ms; saveAutomod(config); }
          showSpam(embedMsg);
        });
      }
      if (id === "am_spam_mute") {
        return askTime("¿Cuánto dura el mute por spam? (ej: `20min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { config.antispam.muteDurationMs = ms; saveAutomod(config); }
          showSpam(embedMsg);
        });
      }
      if (id === "am_spam_domain_add") {
        await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("Escribe el dominio a permitir (ej: `tuwebcore.com`).\nEscribe `cancelar` para cancelar.")], components: [] });
        const reply = await askReply(msg.channel, msg.author.id, "");
        if (!reply || reply.toLowerCase() === "cancelar") return showSpam(embedMsg);
        const domain = reply.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
        if (!config.antispam.allowedDomains.includes(domain)) {
          config.antispam.allowedDomains.push(domain);
          saveAutomod(config);
        }
        return showSpam(embedMsg);
      }
      if (id === "am_spam_domain_remove") {
        if (!config.antispam.allowedDomains.length) {
          await i.followUp({ content: "❌ No hay dominios permitidos.", ephemeral: true });
          return showSpam(embedMsg);
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId("am_spam_domain_remove_select")
          .setPlaceholder("Selecciona el dominio a quitar")
          .addOptions(config.antispam.allowedDomains.map((d) => ({ label: d, value: d })));
        return embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("Selecciona el dominio a quitar.")], components: [new ActionRowBuilder().addComponents(select)] });
      }
      if (id === "am_spam_domain_remove_select") {
        const domain = i.values[0];
        config.antispam.allowedDomains = config.antispam.allowedDomains.filter((d) => d !== domain);
        saveAutomod(config);
        return showSpam(embedMsg);
      }

      // ── Anti-ghost ping: editar valores ───────────────────
      if (id === "am_ghost_warnlimit") {
        return askNumber("¿Cuántas advertencias antes del mute? (1–10)\nEscribe `cancelar` para cancelar.", 1, 10, (n) => {
          if (n) { if (!config.antighost) config.antighost = {}; config.antighost.warnLimit = n; saveAutomod(config); }
          showGhost(embedMsg);
        });
      }
      if (id === "am_ghost_warnreset") {
        return askTime("¿Cada cuánto se resetean las advertencias? (ej: `30min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { if (!config.antighost) config.antighost = {}; config.antighost.warnResetMs = ms; saveAutomod(config); }
          showGhost(embedMsg);
        });
      }
      if (id === "am_ghost_mute") {
        return askTime("¿Cuánto dura el mute por ghost ping? (ej: `20min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
          if (ms) { if (!config.antighost) config.antighost = {}; config.antighost.muteDurationMs = ms; saveAutomod(config); }
          showGhost(embedMsg);
        });
      }

      // ── Antipalabras: nuevo grupo ──────────────────────────
      if (id === "am_words_newgroup") {
        await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("¿Cómo se llama el grupo? (ej: `Insultos`, `NSFW`, `Leve`)\nEscribe `cancelar` para cancelar.")], components: [] });
        const name = await askReply(msg.channel, msg.author.id, "");
        if (!name || name.toLowerCase() === "cancelar") return showWords(embedMsg);

        const newGroup = {
          id: randomUUID().slice(0, 8),
          name: name.trim(),
          enabled: true,
          words: [],
          warnLimit: 3,
          warnResetMs: 3_600_000,
          muteDurationMs: 300_000,
        };
        config.antiwords.groups.push(newGroup);
        saveAutomod(config);
        return showGroup(embedMsg, newGroup.id);
      }

      // ── Antipalabras: seleccionar grupo ───────────────────
      if (id === "am_words_select_group") {
        return showGroup(embedMsg, i.values[0]);
      }

      // ── Antipalabras: acciones de grupo ───────────────────
      if (id.startsWith("am_grp_")) {
        const [action, groupId] = id.replace("am_grp_", "").split(":");
        const group = config.antiwords.groups.find((g) => g.id === groupId);
        if (!group) return showWords(embedMsg);

        if (action === "toggle") {
          group.enabled = !group.enabled;
          saveAutomod(config);
          return showGroup(embedMsg, groupId);
        }

        if (action === "delete") {
          config.antiwords.groups = config.antiwords.groups.filter((g) => g.id !== groupId);
          saveAutomod(config);
          return showWords(embedMsg);
        }

        if (action === "addwords") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("Escribe las palabras separadas por comas (ej: `malo, pésimo, terrible`).\nEscribe `cancelar` para cancelar.")], components: [] });
          const reply = await askReply(msg.channel, msg.author.id, "");
          if (!reply || reply.toLowerCase() === "cancelar") return showGroup(embedMsg, groupId);
          const newWords = reply.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
          for (const w of newWords) if (!group.words.includes(w)) group.words.push(w);
          saveAutomod(config);
          return showGroup(embedMsg, groupId);
        }

        if (action === "removeword") {
          if (!group.words.length) {
            await i.followUp({ content: "❌ El grupo no tiene palabras.", ephemeral: true });
            return showGroup(embedMsg, groupId);
          }
          // Discord solo acepta 25 opciones en un select
          const words = group.words.slice(0, 25);
          const select = new StringSelectMenuBuilder()
            .setCustomId(`am_grp_removeword_select:${groupId}`)
            .setPlaceholder("Selecciona la palabra a quitar")
            .addOptions(words.map((w) => ({ label: w, value: w })));
          return embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("Selecciona la palabra a quitar.")], components: [new ActionRowBuilder().addComponents(select)] });
        }

        if (action === "removeword_select") {
          const word = i.values[0];
          group.words = group.words.filter((w) => w !== word);
          saveAutomod(config);
          return showGroup(embedMsg, groupId);
        }

        if (action === "warnlimit") {
          return askNumber("¿Cuántas advertencias antes del mute? (1–10)\nEscribe `cancelar` para cancelar.", 1, 10, (n) => {
            if (n) { group.warnLimit = n; saveAutomod(config); }
            showGroup(embedMsg, groupId);
          });
        }

        if (action === "warnreset") {
          return askTime("¿Cada cuánto se resetean las advertencias? (ej: `30min`, `1h`, `1d`)\nEscribe `cancelar` para cancelar.", (ms) => {
            if (ms) { group.warnResetMs = ms; saveAutomod(config); }
            showGroup(embedMsg, groupId);
          });
        }

        if (action === "mute") {
          return askTime("¿Cuánto dura el mute para este grupo? (ej: `5min`, `10min`, `1h`)\nEscribe `cancelar` para cancelar.", (ms) => {
            if (ms) { group.muteDurationMs = ms; saveAutomod(config); }
            showGroup(embedMsg, groupId);
          });
        }
      }
    });

    collector.on("end", async () => {
      await embedMsg.edit({ components: [] }).catch(() => {});
    });
  },
};