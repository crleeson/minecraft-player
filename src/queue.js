require("dotenv").config();
const axios = require("axios");
const { getBlock, followPlayer, dropItems } = require("./tasks");

let taskQueue = [];
let isPaused = false;
let currentTask = null;
let chatHistory = [];

function addToHistory(username, message, response) {
  chatHistory.push({ username, message, response });
  if (chatHistory.length > 10) chatHistory.shift();
}

async function processChat(bot, username, message) {
  const historyText = chatHistory
    .map((h) => `${h.username}: ${h.message} -> ${h.response}`)
    .join("\n");
  const prompt = `You’re a chill, casual Minecraft bot. Parse this natural language message into a command or chat response using these options:
  - "command: get <quantity> <block>" (e.g., "command: get 5 oak_log") for gathering blocks. Convert word numbers (e.g., "four" to "4").
  - "command: drop <quantity> <item>" (e.g., "command: drop 5 dirt") for dropping items.
  - "command: follow" for following the player.
  - "command: stop" to pause actions.
  - "command: continue" to resume tasks.
  - "command: cancel" to clear all tasks.
  - "chat: <response>" (e.g., "chat: Yo, what’s good?") for conversation.
  Keep it short and casual. Use this chat history for context (if relevant):
  ${historyText}
  Examples:
  - "get four oak logs" → "command: get 4 oak_log"
  - "drop me 5 dirt" → "command: drop 5 dirt"
  - "follow me" → "command: follow"
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
      console.log("Parsed action:", action);

      if (action === "follow") {
        bot.logChat("On my way, dude!");
        isPaused = true;
        currentTask = null;
        bot.pathfinder.stop();
        await followPlayer(bot, username);
        addToHistory(username, message, "On my way, dude!");
        return;
      }

      if (action.includes("stop")) {
        bot.logChat("Chill, I’m stopping!");
        isPaused = true;
        bot.pathfinder.stop();
        addToHistory(username, message, "Chill, I’m stopping!");
        return;
      }

      if (action.includes("drop")) {
        const parts = action.split(" ");
        const count = parseInt(parts[1]) || 1;
        const itemType = parts[2] || null;
        console.log("Queueing:", {
          type: "dropItems",
          count,
          itemType,
          username,
        });
        taskQueue.push({ type: "dropItems", count, itemType, username });
        bot.logChat(
          `Queued up dropping ${count} ${
            itemType || "items"
          } — I'll bring them to you!`
        );
        addToHistory(
          username,
          message,
          `Queued up dropping ${count} ${
            itemType || "items"
          } — I'll bring them to you!`
        );
        if (!isPaused && !currentTask) processQueue(bot, bot.mcData);
        return;
      }

      if (action.includes("continue") || action.includes("go back")) {
        bot.logChat("Back to it, then!");
        isPaused = false;
        processQueue(bot);
        addToHistory(username, message, "Back to it, then!");
        return;
      }

      if (action.includes("cancel")) {
        bot.logChat("Alright, I’m done with all that!");
        taskQueue = [];
        isPaused = false;
        bot.pathfinder.stop();
        currentTask = null;
        addToHistory(username, message, "Alright, I’m done with all that!");
        return;
      }

      if (action.includes("get")) {
        const quantityMatch = action.match(/\d+/) || ["5"];
        const quantity = parseInt(quantityMatch[0]);
        const blockType = action.split(" ").slice(2).join("_") || "dirt";
        console.log("Queueing:", { type: "getBlock", quantity, blockType });
        taskQueue.push({ type: "getBlock", quantity, blockType });
        bot.logChat(
          `Queued up "get ${quantity} ${blockType.replace(
            "_log",
            " wood"
          )}" — I’ll mosey over!`
        );
        addToHistory(
          username,
          message,
          `Queued up "get ${quantity} ${blockType.replace(
            "_log",
            " wood"
          )}" — I’ll mosey over!`
        );
      }

      console.log("Task queue:", taskQueue);
      if (!isPaused && !currentTask) processQueue(bot, bot.mcData);
    } else if (llmResponse.includes("chat:")) {
      const chatResponse = llmResponse.split("chat: ")[1].trim();
      bot.logChat(chatResponse);
      addToHistory(username, message, chatResponse);
    } else {
      bot.logChat("Just hanging out, huh? What’s up?");
      addToHistory(username, message, "Just hanging out, huh? What’s up?");
    }
  } catch (error) {
    console.error("API call failed:", error.message);
    bot.logChat("Oops, something went wrong with the API!");
    addToHistory(username, message, "Oops, something went wrong with the API!");
  }
}

async function processQueue(bot, mcData) {
  if (isPaused || taskQueue.length === 0 || currentTask) return;

  currentTask = taskQueue.shift();
  console.log("Processing task:", currentTask);

  try {
    switch (currentTask.type) {
      case "getBlock":
        await getBlock(
          bot,
          currentTask.quantity,
          currentTask.blockType,
          mcData
        );
        break;
      case "dropItems":
        await dropItems(
          bot,
          currentTask.count,
          currentTask.itemType,
          currentTask.username
        );
        break;
      default:
        console.log("Unknown task type:", currentTask.type);
    }
  } catch (error) {
    console.error("Error processing task:", error);
    bot.logChat("Oops, something went wrong with that task!");
  }

  currentTask = null;
  isPaused = false;
  processQueue(bot, mcData);
}

module.exports = { processChat, processQueue };
