require("dotenv").config();
const axios = require("axios");
const { getWood, followPlayer, dropItems } = require("./tasks");

let taskQueue = [];
let isPaused = false;
let currentTask = null;

async function processChat(bot, username, message) {
  const prompt = `You’re a chill, casual Minecraft bot. Parse this natural language message into a command or chat response:
  - If it’s a task, return "command: get <quantity> <block>" (e.g., "command: get 5 oak_log") using Minecraft block names (e.g., oak_log, birch_log).
  - If it’s conversation, return "chat: <response>" (e.g., "chat: Yo, what’s good?").
  Keep it short and casual. Examples:
  - "get 5 oak logs" → "command: get 5 oak_log"
  - "hi there" → "chat: Hey, what’s up?"
  Message: "${message}"`;

  console.log("LLM_API_ENDPOINT:", process.env.LLM_API_ENDPOINT);
  console.log(
    "OPENROUTER_API_KEY:",
    process.env.OPENROUTER_API_KEY ? "[set]" : "[not set]"
  );
  console.log("MODEL:", process.env.MODEL);

  if (!process.env.LLM_API_ENDPOINT || !process.env.OPENROUTER_API_KEY) {
    bot.logChat("Yo, my API setup’s busted—check the env file!");
    console.error("Missing LLM_API_ENDPOINT or OPENROUTER_API_KEY in .env");
    return;
  }

  try {
    const response = await axios.post(
      process.env.LLM_API_ENDPOINT,
      {
        model: process.env.MODEL,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const llmResponse = response.data.choices[0].message.content.toLowerCase();
    console.log("LLM says:", llmResponse);

    if (llmResponse.includes("command:")) {
      const action = llmResponse.split("command: ")[1].trim();
      bot.logChat(
        `Roger that, ${username}! ${action.replace(
          "_log",
          " logs"
        )}, comin’ up!`
      );

      if (action.includes("stop")) {
        bot.logChat("Chill, I’m stopping!");
        isPaused = true;
        bot.pathfinder.stop();
        return;
      }
      if (action.includes("follow me") || action.includes("come here")) {
        bot.logChat("On my way, dude!");
        isPaused = true;
        bot.pathfinder.stop();
        followPlayer(bot, username);
        return;
      }
      if (action.includes("drop me")) {
        const count = parseInt(action.match(/\d+/)?.[0]) || 1;
        bot.logChat(`Dropping ${count} items, here ya go!`);
        isPaused = true;
        bot.pathfinder.stop();
        dropItems(bot, count).then(() => (isPaused = false));
        return;
      }
      if (action.includes("continue") || action.includes("go back")) {
        bot.logChat("Back to it, then!");
        isPaused = false;
        processQueue(bot);
        return;
      }
      if (
        action.includes("stop working") ||
        action.includes("cancel everything")
      ) {
        bot.logChat("Alright, I’m done with all that!");
        taskQueue = [];
        isPaused = false;
        bot.pathfinder.stop();
        currentTask = null;
        return;
      }

      if (
        action.includes("get") &&
        (action.includes("wood") ||
          action.includes("logs") ||
          action.includes("_log"))
      ) {
        const quantity = parseInt(action.match(/\d+/)?.[0]) || 5;
        const woodTypeMatch = action.match(
          /(oak|birch|spruce|jungle|acacia|dark_oak)/
        );
        const woodType = woodTypeMatch ? woodTypeMatch[0] : "oak";
        taskQueue.push({ type: "getWood", quantity, woodType });
        bot.logChat(
          `Queued up "get ${quantity} ${woodType} wood" — I’ll mosey over!`
        );
      }

      if (!isPaused && !currentTask) processQueue(bot, bot.mcData);
    } else if (llmResponse.includes("chat:")) {
      const chatResponse = llmResponse.split("chat: ")[1].trim();
      bot.logChat(chatResponse);
    } else {
      bot.logChat("Just hanging out, huh? What’s up?");
    }
  } catch (error) {
    console.error("API call failed:", error.message);
    bot.logChat("Oops, something went wrong with the API!");
  }
}

async function processQueue(bot, mcData) {
  if (isPaused || taskQueue.length === 0 || currentTask) return;

  currentTask = taskQueue.shift();
  if (currentTask.type === "getWood") {
    await getWood(bot, currentTask.quantity, currentTask.woodType, mcData);
  }
  currentTask = null;
  processQueue(bot, mcData);
}

module.exports = { processChat, processQueue };
