// systems/welcome.js
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");

const WLC_CHANNEL_ID = "1309406172167540737";
const BYE_CHANNEL_ID = "1309406262701719572";
const FONDO_PATH     = path.join(process.cwd(), "uploads", "canvas", "fondo.png");

async function fetchBuffer(url) {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function buildCardWithCount(user, type, memberCount) {
  const W = 800, H = 280;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  const fondo = await loadImage(FONDO_PATH);
  ctx.drawImage(fondo, 0, 0, W, H);

  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const accentColor = type === "welcome" ? "#00e5ff" : "#ff6b6b";
  const AX = 110, AY = H / 2, AR = 65;

  // Anillo glow
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(AX, AY, AR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Avatar circular
  ctx.save();
  ctx.beginPath();
  ctx.arc(AX, AY, AR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  try {
    const avatarBuf = await fetchBuffer(user.displayAvatarURL({ extension: "png", size: 256 }));
    const avatarImg = await loadImage(avatarBuf);
    ctx.drawImage(avatarImg, AX - AR, AY - AR, AR * 2, AR * 2);
  } catch {
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(AX - AR, AY - AR, AR * 2, AR * 2);
    ctx.font = "bold 48px Sans";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(user.username[0].toUpperCase(), AX, AY);
  }
  ctx.restore();

  // Línea vertical
  const TX = AX + AR + 30;
  ctx.fillStyle = accentColor;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(TX, AY - 60, 3, 120);
  ctx.shadowBlur = 0;

  const TXT = TX + 20;

  // Greeting — blanco con sombra
  const greeting = type === "welcome" ? "¡Bienvenido/a a CoreCM!" : "¡Hasta pronto!";
  ctx.font = "bold 26px Sans";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(greeting, TXT, AY - 20);

  // Username
  ctx.font = "bold 32px Sans";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(user.username, TXT, AY + 18);
  ctx.shadowBlur = 0;

  // Subtexto
  const sub = type === "welcome"
    ? "Esperamos que disfrutes tu estadía 🎉"
    : "Lamentamos tu partida, vuelve pronto";
  ctx.font = "15px Sans";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText(sub, TXT, AY + 46);

  // Member count
  ctx.font = "bold 13px Sans";
  ctx.fillStyle = accentColor;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 4;
  const countText = type === "welcome"
    ? `• Miembro #${memberCount}`
    : `• Nos quedan ${memberCount} miembros`;
  ctx.fillText(countText, TXT, AY + 70);
  ctx.shadowBlur = 0;

  return canvas.toBuffer("image/png");
}

function setupWelcome(client) {
  client.on("guildMemberAdd", async (member) => {
    const channel = member.guild.channels.cache.get(WLC_CHANNEL_ID);
    if (!channel) return;
    try {
      const buf        = await buildCardWithCount(member.user, "welcome", member.guild.memberCount);
      const attachment = new AttachmentBuilder(buf, { name: "welcome.png" });
      const embed = new EmbedBuilder()
        .setColor(0x00e5ff)
        .setTitle(`¡Bienvenido/a a CoreCM, ${member.user.username}!`)
        .setDescription(`Hola <@${member.id}>, nos alegra tenerte aquí.\nLeé las reglas y disfruta el servidor. 🎉`)
        .setImage("attachment://welcome.png")
        .setFooter({ text: `Miembro #${member.guild.memberCount}` })
        .setTimestamp();
      await channel.send({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error("[Welcome] Error:", err.message);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    const channel = member.guild.channels.cache.get(BYE_CHANNEL_ID);
    if (!channel) return;
    try {
      const buf        = await buildCardWithCount(member.user, "bye", member.guild.memberCount);
      const attachment = new AttachmentBuilder(buf, { name: "bye.png" });
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle(`${member.user.username} se fue de CoreCM`)
        .setDescription(`Lamentamos tu partida <@${member.id}>. ¡Esperamos verte de nuevo pronto!`)
        .setImage("attachment://bye.png")
        .setFooter({ text: `Ahora somos ${member.guild.memberCount} miembros` })
        .setTimestamp();
      await channel.send({ embeds: [embed], files: [attachment] });
    } catch (err) {
      console.error("[Bye] Error:", err.message);
    }
  });

  console.log("[Welcome] Sistema iniciado.");
}

module.exports = { setupWelcome, buildCardWithCount };