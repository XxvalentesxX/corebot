// commands/prefix/ticket/ticket.js
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");
const { errorEmbed } = require("../../../utils/mod");
const { load, save, getConfig } = require("../../../utils/tickets");
const { OWNERS, STAFF_ROLE_ID } = require("../../../config");

function canConfig(member) {
  return OWNERS.includes(member.id) || member.permissions.has("Administrator");
}

const BUTTON_LABELS = {
  soporte:     "🎧 Soporte",
  recompensas: "🏆 Recompensas",
  apply:       "📋 Apply",
  ally:        "🤝 Alianzas",
  report:      "🚨 Reporte",
};

// ── !ticket config ─────────────────────────────────────────────────────────
async function showConfig(msg) {
  const config = getConfig();

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Configuración de Tickets")
    .addFields(
      { name: "Sistema", value: config.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      { name: "\u200b", value: "\u200b", inline: true },
      ...Object.entries(BUTTON_LABELS).map(([key, label]) => ({
        name: label,
        value: config.buttons[key] ? "✅ Activo" : "❌ Inactivo",
        inline: true,
      })),
    )
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tc_toggle_system")
      .setLabel(config.enabled ? "Desactivar sistema" : "Activar sistema")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    ...Object.entries(BUTTON_LABELS).map(([key, label]) =>
      new ButtonBuilder()
        .setCustomId(`tc_toggle_${key}`)
        .setLabel(label)
        .setStyle(config.buttons[key] ? ButtonStyle.Success : ButtonStyle.Danger)
    )
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── !ticket panel ──────────────────────────────────────────────────────────
async function sendPanel(msg) {
  const config = getConfig();

  const activeButtons = Object.entries(config.buttons)
    .filter(([, v]) => v)
    .map(([key]) => key);

  if (!activeButtons.length)
    return msg.reply({ embeds: [errorEmbed("No hay categorías activas para mostrar en el panel.")] });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎫 Centro de Tickets")
    .setDescription(
      "```ansi\n" +
      "\u001b[2;34m🎧 Soporte       \u001b[2;37mRecibí ayuda sobre el servidor o programación.\u001b[0m\n" +
      "\u001b[2;33m🏆 Recompensas   \u001b[2;37mReclamá una recompensa que hayas ganado.\u001b[0m\n" +
      "\u001b[2;32m🤝 Alianzas      \u001b[2;37mFormá una alianza con el equipo Core.\u001b[0m\n" +
      "\u001b[2;31m🚨 Reporte       \u001b[2;37mReportá a un usuario o bot del servidor.\u001b[0m\n" +
      "\u001b[2;35m📋 Apply         \u001b[2;37mPostulate para formar parte del staff.\u001b[0m\n" +
      "```"
    )
    .setFooter({ text: "Abrí un ticket según tu necesidad • Solo un ticket por categoría" })
    .setTimestamp();

  // Divide en filas de máx 5 botones
  const rows = [];
  const chunks = [];
  for (let i = 0; i < activeButtons.length; i += 5) chunks.push(activeButtons.slice(i, i + 5));

  const buttonStyles = {
    soporte:     ButtonStyle.Primary,
    recompensas: ButtonStyle.Secondary,
    apply:       ButtonStyle.Success,
    ally:        ButtonStyle.Success,
    report:      ButtonStyle.Danger,
  };

  for (const chunk of chunks) {
    rows.push(new ActionRowBuilder().addComponents(
      ...chunk.map((key) =>
        new ButtonBuilder()
          .setCustomId(`open_ticket_${key}`)
          .setLabel(BUTTON_LABELS[key])
          .setStyle(buttonStyles[key])
      )
    ));
  }

  await msg.channel.send({ embeds: [embed], components: rows });
  // Borra el comando para que el canal quede limpio
  await msg.delete().catch(() => {});
}

// ── Comando ────────────────────────────────────────────────────────────────
module.exports = {
  name: "ticket",
  aliases: ["tickets"],
  description: "Gestiona el sistema de tickets.",
  async execute(msg, args) {
    const sub = args[0]?.toLowerCase();

    if (!sub || (sub !== "config" && sub !== "panel")) {
      return msg.reply({ embeds: [errorEmbed("Uso: `!ticket config` o `!ticket panel`")] });
    }

    if (sub === "panel") {
      if (!canConfig(msg.member))
        return msg.reply({ embeds: [errorEmbed("No tenés permisos para enviar el panel.")] });
      return sendPanel(msg);
    }

    if (sub === "config") {
      if (!canConfig(msg.member))
        return msg.reply({ embeds: [errorEmbed("No tenés permisos para configurar los tickets.")] });

      const payload = await showConfig(msg);
      const embedMsg = await msg.reply({ ...payload, fetchReply: true });

      const collector = embedMsg.createMessageComponentCollector({
        time: 120_000,
        filter: (i) => i.user.id === msg.author.id,
      });

      collector.on("collect", async (i) => {
        await i.deferUpdate();
        const db = load();

        if (i.customId === "tc_toggle_system") {
          db.config.enabled = !db.config.enabled;
          save(db);
        } else if (i.customId.startsWith("tc_toggle_")) {
          const key = i.customId.replace("tc_toggle_", "");
          if (key in db.config.buttons) {
            db.config.buttons[key] = !db.config.buttons[key];
            save(db);
          }
        }

        const updated = await showConfig(msg);
        await embedMsg.edit(updated);
      });

      collector.on("end", async () => {
        await embedMsg.edit({ components: [] }).catch(() => {});
      });
    }
  },
};