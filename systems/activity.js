// systems/activity.js
// Se conecta al cliente y registra un mensaje por usuario en utils/activity.js
// cuando alguien escribe en el servidor. Solo cuenta mensajes de humanos.

const { recordMessage, purgeOld } = require("../utils/activity");

function setupActivity(client) {
  client.on("messageCreate", (message) => {
    if (message.author.bot)       return;
    if (!message.guild)           return; // DM, ignorar
    recordMessage(message.author.id);
  });

  // Purga entradas viejas una vez al día
  setInterval(() => purgeOld(), 24 * 60 * 60 * 1000);
}

module.exports = { setupActivity };