// commands/prefix/moderation/staff/nuke.js
const { EmbedBuilder } = require("discord.js");
const { errorEmbed } = require("../../../../utils/mod");

const ADMIN_ROLE_ID = "1309303092952563725";

module.exports = {
  name: "nuke",
  description: "Borra y recrea el canal actual con los mismos ajustes.",
  async execute(msg) {
    if (!msg.member.roles.cache.has(ADMIN_ROLE_ID))
      return msg.reply({ embeds: [errorEmbed("No tienes permisos para usar este comando.")] });

    const channel = msg.channel;

    // Guarda todo antes de borrar
    const { name, topic, nsfw, rateLimitPerUser, parentId, type } = channel;
    const permissionOverwrites = channel.permissionOverwrites.cache.map((o) => ({
      id:    o.id,
      type:  o.type,
      allow: o.allow,
      deny:  o.deny,
    }));

    // Posición dentro de la categoría (no global)
    const siblingsBeforeDelete = msg.guild.channels.cache
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => c.id);
    const positionInCategory = siblingsBeforeDelete.indexOf(channel.id);

    await channel.delete("Nuke").catch(() => {});

    const newChannel = await msg.guild.channels.create({
      name,
      type,
      topic,
      nsfw,
      rateLimitPerUser,
      parent: parentId,
      permissionOverwrites,
      reason: "Nuke",
    });

    await new Promise((r) => setTimeout(r, 1500));
    await newChannel.setPosition(positionInCategory, { relative: false }).catch(() => {});

    await newChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("💣 Canal nukeado")
          .setDescription("Este canal fue nukeado.")
          .setTimestamp(),
      ],
    });
  },
};