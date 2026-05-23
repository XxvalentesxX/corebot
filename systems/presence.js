// systems/presence.js
const { ActivityType } = require("discord.js");

// status: "online" | "idle" | "dnd"
// type: ActivityType.Playing / Listening / Watching / Competing
const STATUSES = [
  { status: "online", type: ActivityType.Playing,    text: "con el código de producción 💀" },
  { status: "online", type: ActivityType.Listening,  text: "lo que dicen los devs a las 3am" },
  { status: "online", type: ActivityType.Watching,   text: "si alguien le da push a main" },
  { status: "dnd",    type: ActivityType.Playing,    text: "debuggeando... otra vez" },
  { status: "online", type: ActivityType.Competing,  text: "Stack Overflow copy-paste speedrun" },
  { status: "idle",   type: ActivityType.Listening,  text: "lo fácil que iba a ser esto" },
  { status: "online", type: ActivityType.Watching,   text: "el servidor arder en producción" },
  { status: "dnd",    type: ActivityType.Playing,    text: "git blame a todos 🔍" },
  { status: "online", type: ActivityType.Competing,  text: "el campeonato de semicolons faltantes" },
  { status: "idle",   type: ActivityType.Watching,   text: "a los noobs aprender a la fuerza" },
  { status: "online", type: ActivityType.Listening,  text: "el sonido de un npm install eterno" },
  { status: "dnd",    type: ActivityType.Playing,    text: "con fuego en el servidor 🔥" },
  { status: "online", type: ActivityType.Watching,   text: "el CPU al 100% sin razón aparente" },
  { status: "online", type: ActivityType.Competing,  text: "quién escribe el peor código funcional" },
  { status: "idle",   type: ActivityType.Listening,  text: "ruido blanco mientras espera el build" },
  { status: "online", type: ActivityType.Playing,    text: "a que nadie lee la documentación" },
  { status: "dnd",    type: ActivityType.Watching,   text: "el chaos del canal de bugs 🐛" },
  { status: "online", type: ActivityType.Listening,  text: "llorar en JavaScript" },
  { status: "online", type: ActivityType.Competing,  text: "hackathon de las 2am ☕" },
  { status: "idle",   type: ActivityType.Watching,   text: "si alguien leyó el README alguna vez" },
];

let currentIndex = 0;

function setupPresence(client) {
  function rotate() {
    const s = STATUSES[currentIndex % STATUSES.length];
    client.user.setPresence({
      status: s.status,
      activities: [{ name: s.text, type: s.type }],
    });
    currentIndex++;
  }

  client.once("clientReady", () => {
    rotate();
    // Cambia cada 3 minutos
    setInterval(rotate, 3 * 60 * 1000);
  });

  console.log("[Presence] Sistema iniciado.");
}

module.exports = { setupPresence };