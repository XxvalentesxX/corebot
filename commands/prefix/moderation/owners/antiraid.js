// commands/prefix/moderation/antiraid.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} = require("discord.js");
const { errorEmbed } = require("../../../../utils/mod");
const {
  loadAntiraid, saveAntiraid,
  getBlacklistEntry, setBlacklistEntry, removeBlacklistEntry,
} = require("../../../../utils/antiraid");
const { OWNERS, ANTIRAID_LOG_ID } = require("../../../../config");

function isOwner(userId) {
  return OWNERS.includes(userId);
}

async function sendAntiraidLog(guild, embed) {
  const channel = guild.channels.cache.get(ANTIRAID_LOG_ID);
  if (!channel) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

function blacklistDisplay(config) {
  if (!config.blacklist.length) return "Vacía";
  return config.blacklist
    .map((e) => `${e.type === "ban" ? "🚫" : "👁️"} <@${e.id}>`)
    .join("\n");
}

async function showMainPanel(msg, embedMsg) {
  const config = loadAntiraid();

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🛡️ Panel Antiraid")
    .addFields(
      { name: "Estado", value: config.enabled ? "✅ Activo" : "❌ Inactivo", inline: true },
      { name: "Límite", value: `${config.limit} acciones / minuto`, inline: true },
      { name: "Whitelist", value: `${config.whitelist.length} usuarios`, inline: true },
      { name: "Blacklist", value: `${config.blacklist.length} entradas`, inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ar_toggle")
      .setLabel(config.enabled ? "Desactivar" : "Activar")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ar_whitelist")
      .setLabel("👥 Whitelist")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ar_blacklist")
      .setLabel("🚫 Blacklist")
      .setStyle(ButtonStyle.Secondary),
  );

  if (isOwner(msg.author?.id ?? msg.user?.id)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("ar_limit")
        .setLabel("⚙️ Cambiar Límite")
        .setStyle(ButtonStyle.Primary),
    );
  }

  await embedMsg.edit({ embeds: [embed], components: [row] });
}

module.exports = {
  name: "antiraid",
  aliases: ["ar"],
  description: "Panel de configuración antiraid",
  async execute(msg, args) {
    if (!isOwner(msg.author.id) && !msg.member.permissions.has("Administrator"))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const embedMsg = await msg.reply({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("⏳ Cargando panel...")],
      fetchReply: true,
    });

    await showMainPanel(msg, embedMsg);

    // Guarda el userId pendiente de tipo para el flujo de blacklist
    let pendingBlacklistUserId = null;

    const collector = embedMsg.createMessageComponentCollector({
      time: 120_000,
      filter: (i) => i.user.id === msg.author.id,
    });

    collector.on("collect", async (i) => {
      await i.deferUpdate();
      const config = loadAntiraid();

      // ── Toggle ──────────────────────────────────────────────
      if (i.customId === "ar_toggle") {
        config.enabled = !config.enabled;
        saveAntiraid(config);
        await showMainPanel(msg, embedMsg);
      }

      // ── Cambiar límite ───────────────────────────────────────
      if (i.customId === "ar_limit") {
        if (!isOwner(i.user.id)) return;

        await embedMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0x3498db)
              .setTitle("⚙️ Cambiar Límite")
              .setDescription("Responde con el nuevo límite de acciones por minuto (1–20).\nEscribe `cancelar` para cancelar.")
          ],
          components: [],
        });

        const replyCollector = embedMsg.channel.createMessageCollector({
          filter: (m) => m.author.id === msg.author.id,
          time: 30_000,
          max: 1,
        });

        replyCollector.on("collect", async (reply) => {
          await reply.delete().catch(() => {});
          if (reply.content.toLowerCase() === "cancelar") return showMainPanel(msg, embedMsg);
          const num = parseInt(reply.content);
          if (!num || num < 1 || num > 20) {
            await embedMsg.edit({ embeds: [errorEmbed("Número inválido. Debe ser entre 1 y 20.")], components: [] });
            return setTimeout(() => showMainPanel(msg, embedMsg), 2000);
          }
          config.limit = num;
          saveAntiraid(config);
          await showMainPanel(msg, embedMsg);
        });

        replyCollector.on("end", (_, reason) => {
          if (reason === "time") showMainPanel(msg, embedMsg);
        });
      }

      // ── Ver Whitelist ────────────────────────────────────────
      if (i.customId === "ar_whitelist") {
        const embed = new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("👥 Whitelist")
          .setDescription(
            config.whitelist.length
              ? config.whitelist.map((id) => `<@${id}>`).join("\n")
              : "Vacía"
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ar_wl_add").setLabel("➕ Agregar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("ar_wl_remove").setLabel("➖ Quitar").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ar_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
        );

        await embedMsg.edit({ embeds: [embed], components: [row] });
      }

      // ── Ver Blacklist ────────────────────────────────────────
      if (i.customId === "ar_blacklist") {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("🚫 Blacklist")
          .setDescription(blacklistDisplay(config))
          .setFooter({ text: "🚫 Ban permanente  •  👁️ Watchlist (solo notifica)" });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ar_bl_add").setLabel("➕ Agregar").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("ar_bl_remove").setLabel("➖ Quitar").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ar_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
        );

        await embedMsg.edit({ embeds: [embed], components: [row] });
      }

      // ── Volver ───────────────────────────────────────────────
      if (i.customId === "ar_back") {
        pendingBlacklistUserId = null;
        await showMainPanel(msg, embedMsg);
      }

      // ── Whitelist: agregar ───────────────────────────────────
      if (i.customId === "ar_wl_add") {
        const select = new UserSelectMenuBuilder()
          .setCustomId("ar_wl_select")
          .setPlaceholder("Selecciona un usuario");

        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("Selecciona el usuario para agregar a la **whitelist**.")],
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }

      // ── Whitelist: quitar ────────────────────────────────────
      if (i.customId === "ar_wl_remove") {
        if (!config.whitelist.length) {
          await i.followUp({ content: "❌ La whitelist está vacía.", ephemeral: true });
          return;
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId("ar_wl_remove_select")
          .setPlaceholder("Selecciona el usuario a quitar")
          .addOptions(config.whitelist.map((id) => ({ label: id, value: id })));

        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("Selecciona el usuario a quitar de la **whitelist**.")],
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }

      // ── Blacklist: agregar — paso 1: elegir usuario ──────────
      if (i.customId === "ar_bl_add") {
        const select = new UserSelectMenuBuilder()
          .setCustomId("ar_bl_user_select")
          .setPlaceholder("Selecciona un usuario");

        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0x3498db).setDescription("Selecciona el usuario para agregar a la **blacklist**.")],
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }

      // ── Blacklist: agregar — paso 2: elegir tipo ─────────────
      if (i.customId === "ar_bl_user_select") {
        pendingBlacklistUserId = i.values[0];
        const user = await msg.client.users.fetch(pendingBlacklistUserId).catch(() => null);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("ar_bl_type_ban")
            .setLabel("🚫 Ban permanente")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("ar_bl_type_watch")
            .setLabel("👁️ Watchlist")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("ar_back")
            .setLabel("← Cancelar")
            .setStyle(ButtonStyle.Secondary),
        );

        await embedMsg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(0xe74c3c)
              .setTitle("¿Qué tipo de entrada?")
              .setDescription(user ? `**${user.tag}** (\`${user.id}\`)` : `\`${pendingBlacklistUserId}\``)
              .addFields(
                { name: "🚫 Ban permanente", value: "Lo banea al entrar al server automáticamente." },
                { name: "👁️ Watchlist", value: "Solo te notifica a vos cuando entra. No lo banea." },
              )
          ],
          components: [row],
        });
      }

      // ── Blacklist: agregar — paso 3: confirmar tipo ──────────
      if (i.customId === "ar_bl_type_ban" || i.customId === "ar_bl_type_watch") {
        if (!pendingBlacklistUserId) return showMainPanel(msg, embedMsg);

        const userId = pendingBlacklistUserId;
        pendingBlacklistUserId = null;
        const type = i.customId === "ar_bl_type_ban" ? "ban" : "watch";
        const user = await msg.client.users.fetch(userId).catch(() => null);

        setBlacklistEntry(config, userId, type);
        saveAntiraid(config);

        let bannedNow = false;
        if (type === "ban") {
          const member = await msg.guild.members.fetch(userId).catch(() => null);
          if (member) {
            bannedNow = await member.ban({ reason: "Blacklist antiraid (ban permanente)" }).then(() => true).catch(() => false);
          }
        }

        await sendAntiraidLog(msg.guild, new EmbedBuilder()
          .setColor(type === "ban" ? 0xe74c3c : 0xf39c12)
          .setTitle(type === "ban" ? "🚫 Blacklist — Ban Permanente Agregado" : "👁️ Blacklist — Watchlist Agregado")
          .addFields(
            { name: "Usuario", value: user ? `${user.tag} (\`${userId}\`)` : `\`${userId}\``, inline: true },
            { name: "Por", value: `${msg.author.tag} (\`${msg.author.id}\`)`, inline: true },
            ...(type === "ban" ? [{ name: "Baneado ahora", value: bannedNow ? "✅ Sí (estaba en el server)" : "—", inline: true }] : []),
          )
          .setTimestamp()
        );

        await showMainPanel(msg, embedMsg);
      }

      // ── Blacklist: quitar ────────────────────────────────────
      if (i.customId === "ar_bl_remove") {
        if (!config.blacklist.length) {
          await i.followUp({ content: "❌ La blacklist está vacía.", ephemeral: true });
          return;
        }
        const select = new StringSelectMenuBuilder()
          .setCustomId("ar_bl_remove_select")
          .setPlaceholder("Selecciona el usuario a quitar")
          .addOptions(config.blacklist.map((e) => ({
            label: e.id,
            description: e.type === "ban" ? "🚫 Ban permanente" : "👁️ Watchlist",
            value: e.id,
          })));

        await embedMsg.edit({
          embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription("Selecciona el usuario a quitar de la **blacklist**.")],
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }

      // ── Whitelist: confirmar agregar ─────────────────────────
      if (i.customId === "ar_wl_select") {
        const userId = i.values[0];
        const user = await msg.client.users.fetch(userId).catch(() => null);

        if (!config.whitelist.includes(userId)) {
          config.whitelist.push(userId);
          saveAntiraid(config);

          await sendAntiraidLog(msg.guild, new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("👥 Whitelist — Usuario Agregado")
            .addFields(
              { name: "Usuario", value: user ? `${user.tag} (\`${userId}\`)` : `\`${userId}\``, inline: true },
              { name: "Por", value: `${msg.author.tag} (\`${msg.author.id}\`)`, inline: true },
            )
            .setTimestamp()
          );
        }

        await showMainPanel(msg, embedMsg);
      }

      // ── Whitelist: confirmar quitar ──────────────────────────
      if (i.customId === "ar_wl_remove_select") {
        const userId = i.values[0];
        const user = await msg.client.users.fetch(userId).catch(() => null);

        config.whitelist = config.whitelist.filter((id) => id !== userId);
        saveAntiraid(config);

        await sendAntiraidLog(msg.guild, new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle("👥 Whitelist — Usuario Quitado")
          .addFields(
            { name: "Usuario", value: user ? `${user.tag} (\`${userId}\`)` : `\`${userId}\``, inline: true },
            { name: "Por", value: `${msg.author.tag} (\`${msg.author.id}\`)`, inline: true },
          )
          .setTimestamp()
        );

        await showMainPanel(msg, embedMsg);
      }

      // ── Blacklist: confirmar quitar → desbanea si era ban ────
      if (i.customId === "ar_bl_remove_select") {
        const userId = i.values[0];
        const user = await msg.client.users.fetch(userId).catch(() => null);
        const entry = getBlacklistEntry(config, userId);
        const wasBan = entry?.type === "ban";

        removeBlacklistEntry(config, userId);
        saveAntiraid(config);

        let unbanned = false;
        if (wasBan) {
          unbanned = await msg.guild.bans.fetch(userId)
            .then(() => msg.guild.members.unban(userId, "Removido de blacklist antiraid").then(() => true).catch(() => false))
            .catch(() => false);
        }

        await sendAntiraidLog(msg.guild, new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle("🚫 Blacklist — Usuario Quitado")
          .addFields(
            { name: "Usuario", value: user ? `${user.tag} (\`${userId}\`)` : `\`${userId}\``, inline: true },
            { name: "Por", value: `${msg.author.tag} (\`${msg.author.id}\`)`, inline: true },
            { name: "Era", value: wasBan ? "🚫 Ban permanente" : "👁️ Watchlist", inline: true },
            ...(wasBan ? [{ name: "Desbaneado", value: unbanned ? "✅ Sí" : "❌ No estaba baneado", inline: true }] : []),
          )
          .setTimestamp()
        );

        await showMainPanel(msg, embedMsg);
      }
    });

    collector.on("end", async () => {
      await embedMsg.edit({ components: [] }).catch(() => {});
    });
  },
};