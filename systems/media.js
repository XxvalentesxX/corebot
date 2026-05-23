// systems/media.js
const { MEDIA_CHANNEL_ID } = require("../config");

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/mov", "video/quicktime"];

function isMediaAttachment(attachment) {
  if (attachment.contentType) {
    return IMAGE_TYPES.includes(attachment.contentType) || VIDEO_TYPES.includes(attachment.contentType);
  }
  // Fallback por extensión si Discord no manda contentType
  const url = attachment.url.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/.test(url);
}

function setupMedia(client) {
  client.on("messageCreate", async (msg) => {
    if (!MEDIA_CHANNEL_ID) return;
    if (msg.channel.id !== MEDIA_CHANNEL_ID) return;
    if (msg.author.bot) return;

    const mediaAttachments = msg.attachments.filter(isMediaAttachment);
    const hasMedia = mediaAttachments.size > 0;

    // Sin adjuntos de media → borrar silencioso
    if (!hasMedia) {
      await msg.delete().catch(() => {});
      return;
    }

    // Tiene media → crear hilo
    const threadName = `📸 ${msg.author.username}`;
    await msg.startThread({
      name: threadName.slice(0, 100),
      autoArchiveDuration: 1440, // 24h
      reason: "Hilo de media automático",
    }).catch(() => {});
  });

  console.log("[Media] Sistema iniciado.");
}

module.exports = { setupMedia };