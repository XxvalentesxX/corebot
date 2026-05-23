// commands/prefix/utils/help.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { PREFIX } = require("../../../config");

const P = PREFIX ?? "!";

// ── Categorías ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id:    "moderation",
    label: "🛡️ Moderación",
    description: "Comandos de moderación del servidor",
    color: 0xE74C3C,
    commands: [
      { name: `${P}ban <@usuario> [razón]`,         desc: "Banea a un usuario del servidor." },
      { name: `${P}unban <ID> [razón]`,             desc: "Desbanea a un usuario por ID." },
      { name: `${P}kick <@usuario> [razón]`,        desc: "Expulsa a un usuario del servidor." },
      { name: `${P}mute <@usuario> <tiempo> [razón]`, desc: "Mutea a un usuario. Ej: `30m`, `2h`, `1d`." },
      { name: `${P}unmute <@usuario>`,              desc: "Desmutea a un usuario." },
      { name: `${P}warn <@usuario> [razón]`,        desc: "Advierte a un usuario." },
      { name: `${P}unwarn <@usuario> <#warn>`,      desc: "Elimina un warn específico. Alias: `uw`." },
      { name: `${P}warns <@usuario>`,               desc: "Muestra los warns de un usuario." },
      { name: `${P}purge <cantidad>`,               desc: "Borra mensajes en masa. Alias: `clear`." },
      { name: `${P}nuke`,                           desc: "Borra y recrea el canal actual con los mismos ajustes." },
    ],
  },
  {
    id:    "automod",
    label: "🤖 Automod & Antiraid",
    description: "Configuración automática del servidor",
    color: 0x7B2FBE,
    commands: [
      { name: `${P}automod`,                        desc: "Abre el panel de configuración del automod. Módulos: antiflood, antispam, antipalabras y anti-ghost ping." },
      { name: `${P}antiraid`,                       desc: "Panel de antiraid: activar/desactivar, whitelist y blacklist (tipos `ban` y `watch`). Alias: `ar`." },
    ],
  },
  {
    id:    "tickets",
    label: "🎫 Tickets & Apply",
    description: "Sistema de tickets y postulaciones",
    color: 0x2F6FBE,
    commands: [
      { name: `${P}ticket config`,                  desc: "Activa o desactiva categorías de tickets. Solo admins." },
      { name: `${P}ticket panel`,                   desc: "Envía el panel de tickets al canal actual. Solo admins." },
      { name: `${P}claim`,                          desc: "Reclama o libera un ticket. Doble uso = desclaim. Alias: `cl`." },
      { name: `${P}close`,                          desc: "Abre el prompt de cierre del ticket. Alias: `cls`." },
      { name: `${P}stats [@usuario]`,               desc: "Estadísticas de tickets atendidos y promedio de estrellas del staff." },
      { name: `${P}apply`,                          desc: "Abre el panel de postulaciones (abrir/cerrar y configurar preguntas). Solo admins." },
    ],
  },
  {
    id:    "giveaways",
    label: "🎉 Sorteos",
    description: "Sistema de giveaways",
    color: 0x5865F2,
    commands: [
      { name: `${P}g create`,                       desc: "Abre el panel para crear un sorteo en el canal actual." },
      { name: `${P}g end [ID]`,                     desc: "Termina un sorteo activo. Si hay varios en el canal, pedirá cuál." },
      { name: `${P}g reroll [cantidad]`,            desc: "Reelige ganador/es del último sorteo terminado. Default: 1. También: `${P}g reroll <ID> [cantidad]`." },
      { name: `${P}g admin`,                        desc: "Gestiona usuarios y roles autorizados para crear sorteos. Solo admins." },
    ],
  },
  {
    id:    "music",
    label: "🎵 Música",
    description: "Comandos de música",
    color: 0x1ABC9C,
    commands: [
      { name: `${P}play <canción o URL>`,           desc: "Reproduce una canción o la agrega a la cola. Alias: `p`." },
      { name: `${P}pause`,                          desc: "Pausa la reproducción actual." },
      { name: `${P}resume`,                         desc: "Reanuda la reproducción. Alias: `r`." },
      { name: `${P}skip`,                           desc: "Salta la canción actual. Alias: `s`." },
      { name: `${P}stop`,                           desc: "Detiene la música y limpia la cola. Alias: `st`." },
      { name: `${P}queue`,                          desc: "Muestra la cola de canciones. Alias: `q`." },
      { name: `${P}leave`,                          desc: "Desconecta el bot del canal de voz. Alias: `dc`." },
    ],
  },
];

// ── Embed de categoría ─────────────────────────────────────────────────────
function buildCategoryEmbed(cat) {
  return new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(cat.label)
    .setDescription(cat.commands.map((c) => `\`${c.name}\`\n╰ ${c.desc}`).join("\n\n"))
    .setFooter({ text: `CORE — ${P}help • Categoría ${CATEGORIES.indexOf(cat) + 1}/${CATEGORIES.length}` })
    .setTimestamp();
}

// ── Embed de inicio ────────────────────────────────────────────────────────
function buildHomeEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("📖 CORE — Comandos")
    .setDescription(
      CATEGORIES.map((c) => `**${c.label}** — ${c.description}\n╰ ${c.commands.length} comandos`).join("\n\n")
    )
    .setFooter({ text: `Prefijo: ${P} • Seleccioná una categoría para ver los comandos` })
    .setTimestamp();
}

// ── Select menú ────────────────────────────────────────────────────────────
function buildSelect(currentId = null) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help_select")
      .setPlaceholder("Seleccioná una categoría...")
      .addOptions([
        { label: "🏠 Inicio", value: "home", description: "Resumen de todas las categorías", default: currentId === null },
        ...CATEGORIES.map((c) => ({
          label:       c.label,
          value:       c.id,
          description: c.description,
          default:     c.id === currentId,
        })),
      ])
  );
}

// ── Comando ────────────────────────────────────────────────────────────────
module.exports = {
  name: "help",
  aliases: ["h", "ayuda"],
  description: "Muestra todos los comandos del bot.",
  async execute(msg) {
    const embedMsg = await msg.reply({
      embeds: [buildHomeEmbed()],
      components: [buildSelect()],
      allowedMentions: { repliedUser: false },
      fetchReply: true,
    });

    const collector = embedMsg.createMessageComponentCollector({
      time: 120_000,
      filter: (i) => i.user.id === msg.author.id,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      const val = i.values[0];

      if (val === "home") {
        await embedMsg.edit({ embeds: [buildHomeEmbed()], components: [buildSelect()] });
        return;
      }

      const cat = CATEGORIES.find((c) => c.id === val);
      if (!cat) return;
      await embedMsg.edit({ embeds: [buildCategoryEmbed(cat)], components: [buildSelect(cat.id)] });
    });

    collector.on("end", async () => {
      await embedMsg.edit({ components: [] }).catch(() => {});
    });
  },
};