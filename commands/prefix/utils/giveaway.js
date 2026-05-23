// commands/prefix/utils/giveaway.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder,
} = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const {
  load, save, getGiveaway, getActiveGiveaways,
  updateGiveaway, getAuthorized, addAuthorized, removeAuthorized,
} = require("../../../utils/giveaway");
const { publishGiveaway, endGiveaway, rerollGiveaway } = require("../../../systems/giveaway");
const { OWNERS } = require("../../../config");

const ADMIN_ROLE_ID  = "1309303092952563725";
const MIN_ROLE_ID    = "1309303324385738823"; // Soportes — mínimo para crear sorteos

// Opciones fijas de tiempo en servidor
const SERVER_AGE_OPTIONS = [
  { label: "1 día",   value: "86400000" },
  { label: "3 días",  value: "259200000" },
  { label: "7 días",  value: "604800000" },
  { label: "14 días", value: "1209600000" },
  { label: "30 días", value: "2592000000" },
  { label: "60 días", value: "5184000000" },
  { label: "90 días", value: "7776000000" },
];

// ── Permisos ───────────────────────────────────────────────────────────────
function isAdmin(member) {
  return OWNERS.includes(member.id)
    || member.roles.cache.has(ADMIN_ROLE_ID)
    || member.permissions.has("Administrator");
}

function canCreate(member) {
  // Puede crear si tiene el rol mínimo, o es admin/owner
  return isAdmin(member) || member.roles.cache.has(MIN_ROLE_ID) || isAuthorized(member);
}

function isAuthorized(member) {
  const authorized = getAuthorized();
  return isAdmin(member)
    || authorized.includes(member.id)
    || member.roles.cache.some((r) => authorized.includes(r.id));
}

// ── Helpers ────────────────────────────────────────────────────────────────
function parseMs(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|min|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const u = match[2].toLowerCase();
  const map = { s: 1000, m: 60000, min: 60000, h: 3600000, d: 86400000 };
  return n * (map[u] ?? 0);
}

function formatMs(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
}

function askReply(channel, authorId, timeout = 60_000) {
  return new Promise((resolve) => {
    const collector = channel.createMessageCollector({
      filter: (m) => m.author.id === authorId,
      time: timeout,
      max: 1,
    });
    collector.on("collect", async (m) => {
      await m.delete().catch(() => {});
      resolve(m.content);
    });
    collector.on("end", (_, r) => { if (r === "time") resolve(null); });
  });
}

function buildReqSummary(req) {
  const parts = [];
  if (req.roles?.length)     parts.push(`🎭 Roles: ${req.roles.map((r) => `<@&${r}>`).join(", ")}`);
  if (req.thankHost)         parts.push(`💬 Agradecer al hosteador`);
  if (req.memberCount)       parts.push(`👥 ${req.memberCount} miembros en el server`);
  if (req.entryCount)        parts.push(`🎟️ ${req.entryCount} participantes`);
  if (req.serverAgeMs)       parts.push(`⏳ ${formatMs(req.serverAgeMs)} en el servidor`);
  return parts.length ? parts.join("\n") : "Sin requisitos";
}

// ── Panel de creación ──────────────────────────────────────────────────────
async function showCreate(embedMsg, draft = {}) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("➕ Crear Sorteo")
    .addFields(
      { name: "🎁 Premio",            value: draft.prize ?? "*(sin definir)*",                              inline: true },
      { name: "⏱️ Duración",          value: draft.durationMs ? formatMs(draft.durationMs) : "*(sin definir)*", inline: true },
      { name: "🏆 Ganadores",         value: `${draft.maxWinners ?? 1}`,                                    inline: true },
      { name: "🎟️ Máx. participantes", value: draft.maxEntries ? `${draft.maxEntries}` : "Sin límite",       inline: true },
      { name: "📋 Requisitos",        value: buildReqSummary(draft.requirements ?? {}),                     inline: false },
    )
    .setFooter({ text: "Configurá todos los campos y luego presioná Publicar" })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gw_c_prize").setLabel("🎁 Premio").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gw_c_duration").setLabel("⏱️ Duración").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gw_c_winners").setLabel("🏆 Ganadores").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gw_c_entries").setLabel("🎟️ Máx. entries").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("gw_c_req").setLabel("📋 Requisitos").setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gw_c_publish")
      .setLabel("🚀 Publicar")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!draft.prize || !draft.durationMs),
    new ButtonBuilder().setCustomId("gw_cancel").setLabel("✖ Cancelar").setStyle(ButtonStyle.Danger),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1, row2] });
}

// ── Submenú de requisitos ──────────────────────────────────────────────────
async function showReqMenu(embedMsg, draft) {
  const req = draft.requirements ?? {};

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📋 Requisitos")
    .setDescription(buildReqSummary(req) || "Sin requisitos configurados.")
    .setFooter({ text: "Hacé clic para activar/configurar cada requisito" })
    .setTimestamp();

  // Botón de roles: toggle si ya hay roles
  const rolesLabel = req.roles?.length
    ? `🎭 Roles (${req.roles.length}) ✅`
    : "🎭 Roles";

  // Botón thankHost: toggle visual
  const thankLabel = req.thankHost ? "💬 Agradecer ✅" : "💬 Agradecer";

  // Botón memberCount
  const membersLabel = req.memberCount ? `👥 Miembros (${req.memberCount}) ✅` : "👥 Miembros";

  // Botón entryCount
  const entriesLabel = req.entryCount ? `🎟️ Entries (${req.entryCount}) ✅` : "🎟️ Entries";

  // Botón serverAge
  const serverAgeLabel = req.serverAgeMs
    ? `⏳ Tiempo server (${formatMs(req.serverAgeMs)}) ✅`
    : "⏳ Tiempo en servidor";

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gw_req_roles").setLabel(rolesLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gw_req_thank").setLabel(thankLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gw_req_members").setLabel(membersLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gw_req_entries").setLabel(entriesLabel).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("gw_req_age").setLabel(serverAgeLabel).setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gw_req_clear").setLabel("🗑️ Limpiar todo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("gw_req_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row1, row2] });
}

// ── Panel de admin ─────────────────────────────────────────────────────────
async function showAdmin(embedMsg) {
  const authorized = getAuthorized();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔑 Giveaways — Admin")
    .setDescription(
      authorized.length
        ? authorized.map((id) => `<@${id}> / <@&${id}>`).join("\n")
        : "No hay usuarios ni roles autorizados."
    )
    .setFooter({ text: "Los autorizados pueden crear sorteos aunque no tengan el rol mínimo" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("gw_auth_add_user").setLabel("➕ Usuario").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gw_auth_add_role").setLabel("➕ Rol").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("gw_auth_remove").setLabel("➖ Quitar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("gw_cancel").setLabel("✖ Cerrar").setStyle(ButtonStyle.Secondary),
  );

  await embedMsg.edit({ embeds: [embed], components: [row] });
}

// ── Comando ────────────────────────────────────────────────────────────────
module.exports = {
  name: "giveaway",
  aliases: ["g", "gw", "sorteo"],
  description: "Sistema de giveaways.",
  async execute(msg, args) {
    const sub = args[0]?.toLowerCase();

    // Solo responde a subcomandos exactos
    if (!["create", "end", "reroll", "admin"].includes(sub)) return;

    // ── !g end ──────────────────────────────────────────────────────────────
    if (sub === "end") {
      const active = getActiveGiveaways().filter((g) => g.channelId === msg.channel.id);

      // Si hay varios y no pusieron ID, pedir cuál
      if (!args[1] && active.length > 1) {
        const select = new StringSelectMenuBuilder()
          .setCustomId("gw_end_select")
          .setPlaceholder("¿Cuál sorteo querés terminar?")
          .addOptions(active.map((g) => ({
            label: g.prize.slice(0, 80),
            value: g.id,
            description: `${g.entries.length} participantes`,
          })));

        const embedMsg = await msg.reply({
          embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("Hay varios sorteos activos en este canal. ¿Cuál querés terminar?")],
          components: [new ActionRowBuilder().addComponents(select)],
          fetchReply: true,
        });

        const col = embedMsg.createMessageComponentCollector({ time: 30_000, max: 1, filter: (i) => i.user.id === msg.author.id });
        col.on("collect", async (i) => {
          const gw = getGiveaway(i.values[0]);
          if (!gw) return i.update({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ Sorteo no encontrado.")], components: [] });
          if (!isAdmin(msg.member) && gw.hostId !== msg.author.id)
            return i.update({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("❌ No podés terminar un sorteo que no es tuyo.")], components: [] });
          await i.update({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setDescription("✅ Terminando sorteo...")], components: [] });
          await endGiveaway(msg.client, gw.id, true);
        });
        col.on("end", async (_, r) => { if (r === "time") await embedMsg.delete().catch(() => {}); });
        return;
      }

      // Con ID o hay solo uno
      let gw = args[1] ? getGiveaway(args[1]) : active[0] ?? null;
      if (!gw) return msg.reply({ embeds: [errorEmbed("No se encontró un sorteo activo en este canal.")], allowedMentions: { repliedUser: false } });
      if (!isAdmin(msg.member) && gw.hostId !== msg.author.id)
        return msg.reply({ embeds: [errorEmbed("No podés terminar un sorteo que no es tuyo.")], allowedMentions: { repliedUser: false } });

      await msg.delete().catch(() => {});
      await endGiveaway(msg.client, gw.id, true);
      return;
    }

    // ── !g reroll [cantidad] ────────────────────────────────────────────────
    if (sub === "reroll") {
      // El segundo arg puede ser cantidad (número) o ID (no número)
      const secondArg = args[1];
      let gwId  = null;
      let count = 1;

      if (secondArg) {
        if (/^\d+$/.test(secondArg) && parseInt(secondArg) <= 50) {
          // Es cantidad
          count = parseInt(secondArg);
          // Busca sorteo terminado en el canal
          const allGws = Object.values(load().giveaways);
          const inChannel = allGws.filter((g) => g.channelId === msg.channel.id && g.status === "ended");
          if (!inChannel.length) return msg.reply({ embeds: [errorEmbed("No hay sorteos terminados en este canal.")], allowedMentions: { repliedUser: false } });
          gwId = inChannel[inChannel.length - 1].id; // el más reciente
        } else {
          // Es un ID de mensaje
          gwId  = secondArg;
          count = parseInt(args[2]) || 1;
        }
      } else {
        // Sin args: busca último terminado en el canal
        const allGws = Object.values(load().giveaways);
        const inChannel = allGws.filter((g) => g.channelId === msg.channel.id && g.status === "ended");
        if (!inChannel.length) return msg.reply({ embeds: [errorEmbed("No hay sorteos terminados en este canal.")], allowedMentions: { repliedUser: false } });
        gwId = inChannel[inChannel.length - 1].id;
      }

      const gw = getGiveaway(gwId);
      if (!gw)               return msg.reply({ embeds: [errorEmbed("Sorteo no encontrado.")], allowedMentions: { repliedUser: false } });
      if (gw.status !== "ended") return msg.reply({ embeds: [errorEmbed("El sorteo todavía está activo.")], allowedMentions: { repliedUser: false } });
      if (!isAdmin(msg.member) && gw.hostId !== msg.author.id)
        return msg.reply({ embeds: [errorEmbed("No podés hacer reroll de un sorteo que no es tuyo.")], allowedMentions: { repliedUser: false } });

      await rerollGiveaway(msg.client, gwId, count);
      await msg.delete().catch(() => {});
      return;
    }

    // ── !g admin ────────────────────────────────────────────────────────────
    if (sub === "admin") {
      if (!isAdmin(msg.member))
        return msg.reply({ embeds: [errorEmbed("Solo admins pueden usar este comando.")], allowedMentions: { repliedUser: false } });

      const embedMsg = await msg.reply({
        embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("⏳ Cargando...")],
        fetchReply: true,
      });

      await showAdmin(embedMsg);

      const collector = embedMsg.createMessageComponentCollector({
        time: 180_000,
        filter: (i) => i.user.id === msg.author.id,
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        const id = i.customId;

        if (id === "gw_cancel") { collector.stop(); return; }

        if (id === "gw_auth_add_user") {
          const select = new UserSelectMenuBuilder().setCustomId("gw_auth_user_select").setPlaceholder("Seleccioná un usuario");
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Seleccioná el usuario a autorizar.")], components: [new ActionRowBuilder().addComponents(select)] });
          return;
        }

        if (id === "gw_auth_add_role") {
          const select = new RoleSelectMenuBuilder().setCustomId("gw_auth_role_select").setPlaceholder("Seleccioná un rol");
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription("Seleccioná el rol a autorizar.")], components: [new ActionRowBuilder().addComponents(select)] });
          return;
        }

        if (id === "gw_auth_user_select" || id === "gw_auth_role_select") {
          addAuthorized(i.values[0]);
          return showAdmin(embedMsg);
        }

        if (id === "gw_auth_remove") {
          const authorized = getAuthorized();
          if (!authorized.length) return showAdmin(embedMsg);
          const select = new StringSelectMenuBuilder()
            .setCustomId("gw_auth_remove_select")
            .setPlaceholder("Seleccioná quién quitar")
            .addOptions(authorized.map((aid) => ({ label: aid, value: aid })));
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("Seleccioná quién quitar.")], components: [new ActionRowBuilder().addComponents(select)] });
          return;
        }

        if (id === "gw_auth_remove_select") {
          removeAuthorized(i.values[0]);
          return showAdmin(embedMsg);
        }
      });

      collector.on("end", async () => {
        await embedMsg.edit({ components: [] }).catch(() => {});
      });

      return;
    }

    // ── !g create ───────────────────────────────────────────────────────────
    if (sub === "create") {
      if (!canCreate(msg.member))
        return msg.reply({ embeds: [errorEmbed("No tenés permisos para crear sorteos.")], allowedMentions: { repliedUser: false } });

      const embedMsg = await msg.reply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("⏳ Cargando panel...")],
        fetchReply: true,
      });

      let draft = { requirements: {} };
      await showCreate(embedMsg, draft);

      const collector = embedMsg.createMessageComponentCollector({
        time: 300_000,
        filter: (i) => i.user.id === msg.author.id,
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        const id = i.customId;

        if (id === "gw_cancel") { collector.stop(); return; }

        // ── Campos principales ───────────────────────────────────────────
        if (id === "gw_c_prize") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿Cuál es el premio? Escribí el nombre.\nEscribí `cancelar` para cancelar.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text && text.toLowerCase() !== "cancelar") draft.prize = text.trim();
          return showCreate(embedMsg, draft);
        }

        if (id === "gw_c_duration") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿Cuánto dura el sorteo?\n**Ejemplos:** `30m`, `2h`, `1d`, `7d`\nEscribí `cancelar` para cancelar.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text && text.toLowerCase() !== "cancelar") {
            const ms = parseMs(text.trim());
            if (ms) draft.durationMs = ms;
          }
          return showCreate(embedMsg, draft);
        }

        if (id === "gw_c_winners") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿Cuántos ganadores? (número entre 1 y 20)\nEscribí `cancelar` para cancelar.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text && text.toLowerCase() !== "cancelar") {
            const n = parseInt(text);
            if (n >= 1 && n <= 20) draft.maxWinners = n;
          }
          return showCreate(embedMsg, draft);
        }

        if (id === "gw_c_entries") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿Máximo de participantes? Escribí el número o `ninguno` para sin límite.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text) {
            if (text.toLowerCase() === "ninguno" || text.toLowerCase() === "cancelar") draft.maxEntries = null;
            else { const n = parseInt(text); if (n > 0) draft.maxEntries = n; }
          }
          return showCreate(embedMsg, draft);
        }

        // ── Requisitos ───────────────────────────────────────────────────
        if (id === "gw_c_req") return showReqMenu(embedMsg, draft);
        if (id === "gw_req_back") return showCreate(embedMsg, draft);

        if (id === "gw_req_clear") {
          draft.requirements = {};
          return showReqMenu(embedMsg, draft);
        }

        if (id === "gw_req_thank") {
          draft.requirements.thankHost = !draft.requirements.thankHost;
          return showReqMenu(embedMsg, draft);
        }

        if (id === "gw_req_roles") {
          const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId("gw_req_roles_select")
            .setPlaceholder("Seleccioná los roles requeridos")
            .setMinValues(1).setMaxValues(10);
          await embedMsg.edit({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("Seleccioná los roles que deben tener los participantes para ganar.")],
            components: [new ActionRowBuilder().addComponents(roleSelect)],
          });
          return;
        }

        if (id === "gw_req_roles_select") {
          draft.requirements.roles = i.values;
          return showReqMenu(embedMsg, draft);
        }

        if (id === "gw_req_members") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿A qué cantidad de miembros se resuelve el sorteo? Escribí el número o `quitar`.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text) {
            if (text.toLowerCase() === "quitar") draft.requirements.memberCount = null;
            else { const n = parseInt(text); if (n > 0) draft.requirements.memberCount = n; }
          }
          return showReqMenu(embedMsg, draft);
        }

        if (id === "gw_req_entries") {
          await embedMsg.edit({ embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("¿A cuántos participantes se resuelve el sorteo? Escribí el número o `quitar`.")], components: [] });
          const text = await askReply(msg.channel, msg.author.id);
          if (text) {
            if (text.toLowerCase() === "quitar") draft.requirements.entryCount = null;
            else { const n = parseInt(text); if (n > 0) draft.requirements.entryCount = n; }
          }
          return showReqMenu(embedMsg, draft);
        }

        if (id === "gw_req_age") {
          const select = new StringSelectMenuBuilder()
            .setCustomId("gw_req_age_select")
            .setPlaceholder("¿Cuánto tiempo mínimo en el servidor?")
            .addOptions([
              { label: "Sin requisito", value: "0" },
              ...SERVER_AGE_OPTIONS,
            ]);
          await embedMsg.edit({
            embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription("Seleccioná el tiempo mínimo que debe llevar el usuario en el servidor para ganar.")],
            components: [new ActionRowBuilder().addComponents(select)],
          });
          return;
        }

        if (id === "gw_req_age_select") {
          const ms = parseInt(i.values[0]);
          draft.requirements.serverAgeMs = ms > 0 ? ms : null;
          return showReqMenu(embedMsg, draft);
        }

        // ── Publicar ─────────────────────────────────────────────────────
        if (id === "gw_c_publish") {
          if (!draft.prize || !draft.durationMs) return;

          const gwData = {
            guildId:      msg.guild.id,
            channelId:    msg.channel.id,
            hostId:       msg.author.id,
            prize:        draft.prize,
            endsAt:       Date.now() + draft.durationMs,
            maxWinners:   draft.maxWinners ?? 1,
            maxEntries:   draft.maxEntries ?? null,
            requirements: draft.requirements ?? {},
          };

          collector.stop("published");
          await publishGiveaway(msg.client, gwData);
          await embedMsg.delete().catch(() => {});
          await msg.delete().catch(() => {});
          return;
        }
      });

      collector.on("end", async (_, reason) => {
        if (reason !== "published") {
          await embedMsg.edit({ components: [] }).catch(() => {});
        }
      });

      return;
    }
  },
};