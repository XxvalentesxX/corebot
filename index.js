// index.js
require("dotenv").config();
process.env.FFMPEG_PATH = require("ffmpeg-static");

const { Client, GatewayIntentBits } = require("discord.js");
const { Handler }         = require("./handlers/index");
const { resumeMutes }     = require("./commands/prefix/moderation/staff/mute");
const { takeSnapshot }    = require("./utils/snapshot");
const { setupGiveaway }   = require("./systems/giveaway");
const { setupAntiraid }   = require("./systems/antiraid");
const { setupAutomod }    = require("./systems/automod");
const { setupTickets }    = require("./systems/tickets");
const { setupApply }      = require("./systems/apply");
const { setupWelcome }    = require("./systems/welcome");
const { setupNickname }   = require("./systems/nickname");
const { setupPresence }   = require("./systems/presence");
const { setupMedia }      = require("./systems/media");
const { setupActivity }   = require("./systems/activity");
const { PREFIX }          = require("./config");

const client = new Client({
  intents: Object.values(GatewayIntentBits),
});

setupGiveaway(client);
setupAntiraid(client);
setupAutomod(client);
setupTickets(client);
setupApply(client);
setupWelcome(client);
setupNickname(client);
setupPresence(client);
setupMedia(client);
setupActivity(client);

const handler = new Handler(client, PREFIX);
handler.commands("./commands");

client.once("clientReady", async () => {
  console.log(`[Bot] Online como ${client.user.tag}`);
  await resumeMutes(client);

  for (const guild of client.guilds.cache.values()) {
    await takeSnapshot(guild);
  }
});

client.login(process.env.TOKEN);