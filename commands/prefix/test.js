// commands/prefix/test.js
const { AttachmentBuilder } = require("discord.js");
const { errorEmbed } = require("../../utils/mod");
const { buildCardWithCount } = require("../../systems/welcome");

module.exports = {
  name: "test",
  description: "Prueba el welcome o bye con tu usuario.",
  async execute(msg, args) {
    const sub = args[0]?.toLowerCase();
    if (sub !== "wlc" && sub !== "bye")
      return msg.reply({ embeds: [errorEmbed("Uso: `!test wlc` o `!test bye`")] });

    const type = sub === "wlc" ? "welcome" : "bye";
    try {
      const buf        = await buildCardWithCount(msg.author, type, msg.guild.memberCount);
      const attachment = new AttachmentBuilder(buf, { name: `${type}.png` });
      await msg.reply({ content: `Preview de **${type}**:`, files: [attachment] });
    } catch (err) {
      console.error("[Test] Error:", err.message);
      await msg.reply({ embeds: [errorEmbed(`Error: ${err.message}`)] });
    }
  },
};