// commands/prefix/moderation/owners/staff.js
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { errorEmbed, sendLog } = require("../../../../utils/mod");
const { getWarns }            = require("../../../../utils/warns");
const { getActivity }         = require("../../../../utils/activity");
const { OWNERS }              = require("../../../../config");

// ─────────────────────────────────────────────────────────────────────────────
// JERARQUÍA (índice 0 = más bajo)
// ─────────────────────────────────────────────────────────────────────────────
const HIERARCHY = [
  { id: "1309303353720967239", name: "Trial Support", emoji: "🔰" },
  { id: "1309303324385738823", name: "Soporte",       emoji: "🎫" },
  { id: "1309303383814836245", name: "Trial Mod",     emoji: "🛡️" },
  { id: "1309303527817875477", name: "Mod",           emoji: "⚔️" },
  { id: "1309303181867749406", name: "Trial Admin",   emoji: "⚡" },
  { id: "1309303092952563725", name: "Admin",         emoji: "👑" },
  { id: "1309304920314482718", name: "Owner",         emoji: "🔱" },
];

const ROLE_STAFF_ZONE = "1309303771087638590";
const ROLE_STAFF      = "1309303269268521002";
const ROLE_EX_STAFF   = "1309304642601222204";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE PERMISOS
// ─────────────────────────────────────────────────────────────────────────────
const isOwner = (member) => OWNERS.includes(member.id);
const isAdmin = (member) =>
  OWNERS.includes(member.id) ||
  member.roles.cache.has("1309303092952563725") ||
  member.permissions.has("Administrator");

/** Índice más alto en HIERARCHY que tiene el miembro, o -1 */
function topIdx(member) {
  for (let i = HIERARCHY.length - 1; i >= 0; i--)
    if (member.roles.cache.has(HIERARCHY[i].id)) return i;
  return -1;
}

function roleName(idx) {
  if (idx < 0)                 return "Sin rol staff";
  if (idx >= HIERARCHY.length) return `${HIERARCHY[HIERARCHY.length - 1].emoji} ${HIERARCHY[HIERARCHY.length - 1].name}`;
  return `${HIERARCHY[idx].emoji} ${HIERARCHY[idx].name}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE ACTIVIDAD
// ─────────────────────────────────────────────────────────────────────────────
function activityBar(byDay) {
  const max  = Math.max(...byDay.map((d) => d.count), 1);
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  return byDay
    .map(({ count }) => bars[Math.min(Math.floor((count / max) * 7), 7)])
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// EMBEDS
// ─────────────────────────────────────────────────────────────────────────────
function embedWelcome(user) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛡️ Panel de Staff")
    .setDescription(
      `Bienvenido, ${user}.\n\n` +
      `Desde acá podés gestionar los roles del equipo, revisar actividad y ` +
      `tomar decisiones sobre ascensos o bajas.\n\n` +
      `**¿Qué querés hacer?**`
    )
    .setFooter({ text: "Solo Owners y Admins pueden usar este panel" })
    .setTimestamp();
}

async function embedActivity(guild) {
  await guild.members.fetch();
  const staffMembers = guild.members.cache.filter((m) =>
    HIERARCHY.some((r) => m.roles.cache.has(r.id))
  );

  const lines = [...staffMembers.values()]
    .sort((a, b) => topIdx(b) - topIdx(a))
    .map((m) => {
      const idx        = topIdx(m);
      const { total, byDay } = getActivity(m.id, 7);
      const warns      = getWarns(m.id).length;
      const bar        = activityBar(byDay);
      return (
        `${roleName(idx)} — ${m}\n` +
        `╰ \`${bar}\` **${total}** msgs esta semana · **${warns}** warns`
      );
    });

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📊 Actividad del Staff — Última semana")
    .setDescription(lines.length ? lines.join("\n\n") : "*No hay miembros staff en caché.*")
    .setFooter({ text: "Los contadores se registran desde que el bot está online" })
    .setTimestamp();
}

function embedMemberDetail(member, mode, demoteSteps = 1) {
  const idx              = topIdx(member);
  const warns            = getWarns(member.id);
  const { total, byDay } = getActivity(member.id, 7);
  const bar              = activityBar(byDay);

  const dayLabels = byDay.map(({ date, count }) => {
    const d = new Date(date + "T12:00:00");
    return `\`${d.toLocaleDateString("es", { weekday: "short" })}\` ${count}`;
  }).join(" · ");

  // ¿En qué quedaría?
  let resultStr;
  if (mode === "promote") {
    resultStr = idx >= HIERARCHY.length - 1
      ? "⚠️ Ya es Owner"
      : roleName(idx + 1);
  } else {
    const newIdx = idx - demoteSteps;
    resultStr    = newIdx < 0 ? "🚫 EX STAFF" : roleName(newIdx);
  }

  const color = mode === "promote" ? 0x57f287 : 0xfee75c;
  const title = mode === "promote"
    ? `⬆️ Promote — ${member.user.username}`
    : `⬇️ Demote — ${member.user.username}`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "Rol actual",     value: roleName(idx),                      inline: true },
      { name: mode === "promote" ? "Subiría a" : `Quedaría en (−${demoteSteps})`,
                                value: resultStr,                           inline: true },
      { name: "\u200b",         value: "\u200b",                           inline: true },
      { name: "Mensajes (7d)",  value: `\`${bar}\` **${total} msgs**`,     inline: false },
      { name: "Desglose diario", value: dayLabels || "*sin datos aún*",    inline: false },
      {
        name: `Warns (total: ${warns.length})`,
        value: warns.length
          ? warns.slice(-3).map((w) => `• ${w.reason}`).join("\n") +
            (warns.length > 3 ? `\n_…y ${warns.length - 3} más_` : "")
          : "Sin warns",
        inline: false,
      },
    )
    .setTimestamp();

  return embed;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────
function rowMain() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sp_activity").setLabel("📊 Actividad").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("sp_promote").setLabel("⬆️ Promote").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("sp_demote").setLabel("⬇️ Demote").setStyle(ButtonStyle.Danger),
  );
}

function rowBack() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sp_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary)
  );
}

function rowUserSelect(customId, placeholder) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1).setMaxValues(1)
  );
}

function rowPromoteConfirm(idx) {
  const capped = idx >= HIERARCHY.length - 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sp_promote_confirm")
      .setLabel(capped ? "⚠️ Ya es el rango máximo" : `✅ Confirmar ascenso → ${roleName(idx + 1)}`)
      .setStyle(capped ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(capped),
    new ButtonBuilder().setCustomId("sp_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );
}

function rowsDemote(steps, idx, executorIsOwner, targetId, executorId) {
  const resultIdx = idx - steps;
  const willFire  = resultIdx < 0;
  const resultStr = willFire ? "🚫 EX STAFF" : roleName(resultIdx);
  const canRetire = executorIsOwner || targetId === executorId;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sp_dminus")
      .setLabel("−(−1)")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(steps <= 1),
    new ButtonBuilder()
      .setCustomId("sp_dplus")
      .setLabel("+(−1)")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(steps >= idx + 1),
    new ButtonBuilder()
      .setCustomId("sp_demote_confirm")
      .setLabel(`⬇️ Demote −${steps} → ${resultStr}`)
      .setStyle(willFire ? ButtonStyle.Danger : ButtonStyle.Primary)
      .setDisabled(!executorIsOwner),
  );

  const row2 = new ActionRowBuilder().addComponents(
    ...(canRetire
      ? [new ButtonBuilder().setCustomId("sp_retire").setLabel("🚪 Retirar").setStyle(ButtonStyle.Danger)]
      : []),
    new ButtonBuilder().setCustomId("sp_back").setLabel("← Volver").setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCIONES SOBRE ROLES
// ─────────────────────────────────────────────────────────────────────────────
async function applyPromote(target) {
  const idx = topIdx(target);
  if (idx === -1) {
    await target.roles.add([HIERARCHY[0].id, ROLE_STAFF, ROLE_STAFF_ZONE]);
    return { newIdx: 0, entered: true };
  }
  if (idx >= HIERARCHY.length - 1) return { capped: true };
  await target.roles.add(HIERARCHY[idx + 1].id);
  return { newIdx: idx + 1 };
}

async function applyDemote(target, steps) {
  const idx    = topIdx(target);
  const newIdx = idx - steps;

  const allStaffRoles = HIERARCHY.map((r) => r.id).filter((id) => target.roles.cache.has(id));

  if (newIdx < 0) {
    const remove = [...new Set([...allStaffRoles, ROLE_STAFF, ROLE_STAFF_ZONE])].filter((id) =>
      target.roles.cache.has(id)
    );
    await target.roles.remove(remove);
    await target.roles.add(ROLE_EX_STAFF);
    return { fired: true, prevIdx: idx };
  }

  await target.roles.remove(HIERARCHY[idx].id);
  await target.roles.add(HIERARCHY[newIdx].id);
  return { fired: false, prevIdx: idx, newIdx };
}

async function applyRetire(target) {
  const idx           = topIdx(target);
  const allStaffRoles = HIERARCHY.map((r) => r.id).filter((id) => target.roles.cache.has(id));
  const remove        = [...new Set([...allStaffRoles, ROLE_STAFF, ROLE_STAFF_ZONE])].filter((id) =>
    target.roles.cache.has(id)
  );
  await target.roles.remove(remove);
  await target.roles.add(ROLE_EX_STAFF);
  return { prevIdx: idx };
}

async function sendDM(target, lines) {
  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("📋 Actualización de tu rol en el Staff")
          .setDescription(lines.join("\n"))
          .setTimestamp(),
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDO PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name: "staff",
  aliases: ["sp"],
  description: "Panel de gestión del equipo staff",

  async execute(msg) {
    if (!isAdmin(msg.member))
      return msg.reply({ embeds: [errorEmbed("Solo **Owners** y **Admins** pueden usar el panel de staff.")] });

    // ── Estado de la sesión ──────────────────────────────────────────────
    const s = {
      mode: "home",          // home | activity | promote_select | promote_detail | demote_select | demote_detail
      target: null,          // GuildMember
      demoteSteps: 1,
    };

    // ── Render inicial ───────────────────────────────────────────────────
    const panel = await msg.reply({
      embeds: [embedWelcome(msg.author)],
      components: [rowMain()],
    });

    // ── Función render ───────────────────────────────────────────────────
    async function render(interaction) {
      const doUpdate = (data) =>
        interaction ? interaction.update(data) : panel.edit(data);

      switch (s.mode) {
        case "home":
          return doUpdate({ embeds: [embedWelcome(msg.author)], components: [rowMain()] });

        case "activity": {
          const embed = await embedActivity(msg.guild);
          return doUpdate({ embeds: [embed], components: [rowBack()] });
        }

        case "promote_select":
          return doUpdate({
            embeds: [
              new EmbedBuilder().setColor(0x57f287)
                .setTitle("⬆️ Promote — Elegí un miembro")
                .setDescription("Seleccioná al miembro que querés ascender."),
            ],
            components: [rowUserSelect("sp_user_promote", "Seleccionar miembro…"), rowBack()],
          });

        case "promote_detail": {
          const idx = topIdx(s.target);
          return doUpdate({
            embeds: [embedMemberDetail(s.target, "promote")],
            components: [rowPromoteConfirm(idx)],
          });
        }

        case "demote_select":
          return doUpdate({
            embeds: [
              new EmbedBuilder().setColor(0xfee75c)
                .setTitle("⬇️ Demote — Elegí un miembro")
                .setDescription("Seleccioná al miembro al que querés bajar de rango."),
            ],
            components: [rowUserSelect("sp_user_demote", "Seleccionar miembro…"), rowBack()],
          });

        case "demote_detail": {
          const idx = topIdx(s.target);
          s.demoteSteps = Math.max(1, Math.min(s.demoteSteps, idx + 1));
          const rows = rowsDemote(
            s.demoteSteps, idx,
            isOwner(msg.member),
            s.target.id, msg.author.id
          );
          return doUpdate({
            embeds: [embedMemberDetail(s.target, "demote", s.demoteSteps)],
            components: rows,
          });
        }
      }
    }

    // ── Modal helper ─────────────────────────────────────────────────────
    async function showModal(interaction, customId, title) {
      const modal = new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Razón (llegará por MD al usuario)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          )
        );
      await interaction.showModal(modal);
    }

    // ── Collector de botones del AUTOR ───────────────────────────────────
    const btnCollector = panel.createMessageComponentCollector({
      filter: (i) => i.isButton(),
      time: 180_000,
    });

    btnCollector.on("collect", async (i) => {
      // "Retirar" puede tocarlo el target también — se maneja aparte
      if (i.customId === "sp_retire") {
        const canRetire =
          i.user.id === msg.author.id ||
          (s.target && i.user.id === s.target.id) ||
          isOwner(i.member);
        if (!canRetire)
          return i.reply({ embeds: [errorEmbed("No tenés permiso para retirar a este usuario.")], ephemeral: true });
        return showModal(i, "sp_modal_retire", "Razón del retiro");
      }

      // El resto solo lo opera el autor del panel
      if (i.user.id !== msg.author.id) return;

      switch (i.customId) {
        case "sp_back":
          if      (s.mode === "promote_detail") s.mode = "promote_select";
          else if (s.mode === "demote_detail")  s.mode = "demote_select";
          else                                  s.mode = "home";
          return render(i);

        case "sp_activity":
          s.mode = "activity";
          return render(i);

        case "sp_promote":
          s.mode = "promote_select";
          return render(i);

        case "sp_demote":
          s.mode = "demote_select";
          return render(i);

        case "sp_dplus":
          s.demoteSteps++;
          return render(i);

        case "sp_dminus":
          s.demoteSteps = Math.max(1, s.demoteSteps - 1);
          return render(i);

        case "sp_promote_confirm":
          if (!isAdmin(i.member))
            return i.reply({ embeds: [errorEmbed("Sin permisos.")], ephemeral: true });
          return showModal(i, "sp_modal_promote", "Razón del ascenso");

        case "sp_demote_confirm":
          if (!isOwner(i.member))
            return i.reply({ embeds: [errorEmbed("Solo los **Owners** pueden ejecutar demotes.")], ephemeral: true });
          return showModal(i, "sp_modal_demote", "Razón del demote");
      }
    });

    // ── Collector de UserSelect ──────────────────────────────────────────
    const selCollector = panel.createMessageComponentCollector({
      filter: (i) => i.user.id === msg.author.id && i.isUserSelectMenu(),
      time: 180_000,
    });

    selCollector.on("collect", async (i) => {
      if (i.customId !== "sp_user_promote" && i.customId !== "sp_user_demote") return;

      const target = await msg.guild.members.fetch(i.values[0]).catch(() => null);
      if (!target)
        return i.reply({ embeds: [errorEmbed("No encontré ese usuario.")], ephemeral: true });
      if (target.id === msg.author.id)
        return i.reply({ embeds: [errorEmbed("No podés aplicarte esto a vos mismo.")], ephemeral: true });

      const execIdx   = topIdx(msg.member);
      const targetIdx = topIdx(target);
      if (!isOwner(msg.member) && execIdx !== -1 && targetIdx >= execIdx)
        return i.reply({ embeds: [errorEmbed("No podés modificar a alguien con igual o mayor rango que el tuyo.")], ephemeral: true });

      s.target      = target;
      s.demoteSteps = 1;
      s.mode        = i.customId === "sp_user_promote" ? "promote_detail" : "demote_detail";
      return render(i);
    });

    // ── Listener de modales ──────────────────────────────────────────────
    const modalListener = async (i) => {
      if (!i.isModalSubmit()) return;
      if (!["sp_modal_promote", "sp_modal_demote", "sp_modal_retire"].includes(i.customId)) return;
      if (i.user.id !== msg.author.id && !(s.target && i.user.id === s.target.id)) return;

      await i.deferUpdate().catch(() => {});
      const reason = i.fields.getTextInputValue("reason");

      try {
        // ── PROMOTE ──────────────────────────────────────────────────────
        if (i.customId === "sp_modal_promote") {
          const prevIdx = topIdx(s.target);
          const result  = await applyPromote(s.target);
          if (result.capped)
            return panel.edit({ embeds: [errorEmbed(`**${s.target.user.username}** ya tiene el rango máximo.`)], components: [rowBack()] });

          const newName = roleName(result.newIdx);
          await sendDM(s.target, [
            `¡Hola, **${s.target.user.username}**!`,
            "",
            `Fuiste **ascendido** en el equipo de staff.`,
            "",
            `**Nuevo rol:** ${newName}`,
            `**Razón:** ${reason}`,
            "",
            "¡Felicitaciones! 🎉",
          ]);

          await sendLog(msg.guild,
            new EmbedBuilder().setColor(0x57f287).setTitle("⬆️ Promote — Log")
              .addFields(
                { name: "Usuario",       value: `${s.target.user.tag} (\`${s.target.id}\`)`, inline: true },
                { name: "Rol anterior",  value: roleName(prevIdx),                            inline: true },
                { name: "Nuevo rol",     value: newName,                                      inline: true },
                { name: "Ejecutado por", value: `${msg.author.tag}`,                          inline: true },
                { name: "Razón",         value: reason },
              ).setTimestamp()
          );

          await panel.edit({
            embeds: [
              new EmbedBuilder().setColor(0x57f287).setTitle("✅ Promote exitoso")
                .setDescription(`${s.target} fue ascendido a **${newName}**.\n\n*Razón:* ${reason}`)
                .setThumbnail(s.target.user.displayAvatarURL()).setTimestamp(),
            ],
            components: [rowBack()],
          });
          s.mode = "home";
        }

        // ── DEMOTE ───────────────────────────────────────────────────────
        else if (i.customId === "sp_modal_demote") {
          const result  = await applyDemote(s.target, s.demoteSteps);
          const newName = result.fired ? "EX STAFF" : roleName(result.newIdx);

          await sendDM(s.target, [
            `Hola, **${s.target.user.username}**.`,
            "",
            result.fired
              ? "Fuiste **removido del staff**."
              : "Fuiste **bajado de rango** en el staff.",
            "",
            `**Rol anterior:** ${roleName(result.prevIdx)}`,
            `**Rol actual:** ${newName}`,
            `**Razón:** ${reason}`,
          ]);

          await sendLog(msg.guild,
            new EmbedBuilder()
              .setColor(result.fired ? 0xed4245 : 0xfee75c)
              .setTitle(result.fired ? "🚫 Demote — Expulsión" : "⬇️ Demote — Log")
              .addFields(
                { name: "Usuario",       value: `${s.target.user.tag} (\`${s.target.id}\`)`, inline: true },
                { name: "Rol anterior",  value: roleName(result.prevIdx),                     inline: true },
                { name: "Rol actual",    value: newName,                                      inline: true },
                { name: "Ejecutado por", value: `${msg.author.tag}`,                          inline: true },
                { name: "Razón",         value: reason },
              ).setTimestamp()
          );

          await panel.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(result.fired ? 0xed4245 : 0xfee75c)
                .setTitle(result.fired ? "🚫 Miembro removido del staff" : "✅ Demote exitoso")
                .setDescription(
                  result.fired
                    ? `${s.target} fue removido del staff y recibió el rol <@&${ROLE_EX_STAFF}>.\n\n*Razón:* ${reason}`
                    : `${s.target} fue bajado a **${newName}**.\n\n*Razón:* ${reason}`
                )
                .setThumbnail(s.target.user.displayAvatarURL()).setTimestamp(),
            ],
            components: [rowBack()],
          });
          s.mode = "home";
        }

        // ── RETIRE ───────────────────────────────────────────────────────
        else if (i.customId === "sp_modal_retire") {
          const result  = await applyRetire(s.target);
          const isSelf  = i.user.id === s.target.id;

          await sendDM(s.target, [
            `Hola, **${s.target.user.username}**.`,
            "",
            isSelf
              ? "Tu retiro del staff fue procesado exitosamente."
              : "Fuiste **retirado del staff**.",
            "",
            `**Rol que tenías:** ${roleName(result.prevIdx)}`,
            `**Razón:** ${reason}`,
          ]);

          await sendLog(msg.guild,
            new EmbedBuilder().setColor(0xed4245).setTitle("🚪 Retiro del staff")
              .addFields(
                { name: "Usuario",       value: `${s.target.user.tag} (\`${s.target.id}\`)`, inline: true },
                { name: "Rol que tenía", value: roleName(result.prevIdx),                     inline: true },
                { name: "Retirado por",  value: `${i.user.tag}`,                              inline: true },
                { name: "Razón",         value: reason },
              ).setTimestamp()
          );

          await panel.edit({
            embeds: [
              new EmbedBuilder().setColor(0xed4245).setTitle("🚪 Miembro retirado del staff")
                .setDescription(
                  `${s.target} fue retirado del equipo de staff y recibió el rol <@&${ROLE_EX_STAFF}>.\n\n*Razón:* ${reason}`
                )
                .setThumbnail(s.target.user.displayAvatarURL()).setTimestamp(),
            ],
            components: [rowBack()],
          });
          s.mode = "home";
        }

      } catch (err) {
        console.error("[staff panel] error en modal:", err);
        await panel.edit({ embeds: [errorEmbed(`Error inesperado: ${err.message}`)], components: [rowBack()] }).catch(() => {});
      }
    };

    msg.client.on("interactionCreate", modalListener);

    // ── Cleanup al expirar ───────────────────────────────────────────────
    btnCollector.on("end", () => {
      msg.client.off("interactionCreate", modalListener);
      panel.edit({ components: [] }).catch(() => {});
    });
  },
};