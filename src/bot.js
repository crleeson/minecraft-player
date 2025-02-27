const mineflayer = require("mineflayer");
const { pathfinder, Movements } = require("mineflayer-pathfinder");
const mcData = require("minecraft-data");
const { loadTasks } = require("./tasks");
const { processChat, processQueue } = require("./queue");
const config = require("../config/server.json");

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  version: "1.21.4",
});

bot.loadPlugin(pathfinder);

function logChat(message) {
  console.log(`Bot says: ${message}`);
  bot.chat(message);
}

bot.once("spawn", () => {
  console.log("Bot spawned!");
  const mcDataInstance = mcData(bot.version);
  console.log("mcData loaded:", !!mcDataInstance);
  console.log("mcData.blocks exists:", !!mcDataInstance?.blocks);
  console.log("mcData.blocksByName exists:", !!mcDataInstance?.blocksByName);
  console.log(
    "mcData.blocks sample:",
    mcDataInstance?.blocks["oak_log"] || "none"
  );
  console.log(
    "mcData.blocksByName sample:",
    mcDataInstance?.blocksByName["oak_log"] || "none"
  );
  console.log(
    "mcData.blocks keys:",
    Object.keys(mcDataInstance?.blocks || {}).slice(0, 10)
  );
  console.log(
    "mcData.blocksByName keys:",
    Object.keys(mcDataInstance?.blocksByName || {}).slice(0, 10)
  );
  if (!mcDataInstance) {
    console.log("Failed to load minecraft-data for version 1.21.4");
    bot.quit();
    return;
  }
  const defaultMove = new Movements(bot, mcDataInstance);
  bot.pathfinder.setMovements(defaultMove);
  loadTasks(bot, mcDataInstance);
  bot.mcData = mcDataInstance;
  bot.logChat = logChat;
  processQueue(bot, mcDataInstance);
});

bot.on("chat", (username, message) => {
  if (username === bot.username) return;
  console.log(`${username}: ${message}`);
  processChat(bot, username, message);
});

bot.on("error", (err) => console.log(err));
bot.on("kicked", (reason) => console.log(`Kicked: ${reason}`));
