// systems/nickname.js
const CHANNEL_ID = "1311504148860243988";
const ROLE_ID    = "1311502249821732945";

function setupNickname(client) {
  client.on("messageCreate", async (msg) => {
    if (!msg.guild || msg.author.bot) return;
    if (msg.channel.id !== CHANNEL_ID) return;

    const nickname = msg.content.trim();

    // Borra el mensaje para mantener el canal limpio
    await msg.delete().catch(() => {});

    if (!nickname || nickname.length > 32) return;

    // Cambia el nickname
    await msg.member.setNickname(nickname, "Nickname setup").catch(() => {});

    // Quita el rol
    await msg.member.roles.remove(ROLE_ID, "Nickname setup completado").catch(() => {});
  });

  console.log("[Nickname] Sistema iniciado.");
}

module.exports = { setupNickname };