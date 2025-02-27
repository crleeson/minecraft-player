const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3").Vec3;

function loadTasks(bot, mcData) {
  bot.loadPlugin(pathfinder);
  const defaultMove = new Movements(bot, mcData);
  defaultMove.digCost = 1;
  defaultMove.canDig = true;
  defaultMove.allowSprinting = true;
  defaultMove.maxDropDown = 3; // Allow larger drops
  defaultMove.blocksCantBreak = new Set(); // Clear any blocks that can't be broken
  bot.pathfinder.setMovements(defaultMove);
}

async function getBlock(bot, quantity, blockType, mcData) {
  console.log("getBlock mcData:", !!mcData);
  console.log("mcData.blocksByName:", !!mcData?.blocksByName);
  console.log(
    "Checking block:",
    blockType,
    "Exists:",
    !!mcData?.blocksByName[blockType]
  );

  bot.logChat(`Heading out to get ${quantity} ${blockType}!`);
  if (!mcData?.blocksByName[blockType]) {
    bot.logChat(
      `I don’t know what ${blockType} is! Try dirt, stone, oak_log, etc.`
    );
    return;
  }

  let collected = 0;
  while (collected < quantity) {
    let targetBlock = bot.findBlock({
      matching: mcData.blocksByName[blockType].id,
      maxDistance: 32,
    });

    if (!targetBlock) {
      bot.logChat(`Ran out of ${blockType} nearby! Got ${collected} so far.`);
      console.log("No target block found within 32 blocks");
      break;
    }

    console.log("Target block:", targetBlock.position);

    // Calculate the best approach position
    const approachPositions = [
      targetBlock.position.offset(1, 0, 0), // east
      targetBlock.position.offset(-1, 0, 0), // west
      targetBlock.position.offset(0, 0, 1), // south
      targetBlock.position.offset(0, 0, -1), // north
      targetBlock.position.offset(0, 1, 0), // above
      targetBlock.position.offset(0, -1, 0), // below
    ];

    // Find the most accessible position
    let bestPos = null;
    let bestDistance = Infinity;
    for (const pos of approachPositions) {
      const distance = bot.entity.position.distanceTo(pos);
      const block = bot.blockAt(pos);
      // Prefer positions that are air or easily breakable
      if (
        block &&
        (block.name === "air" || block.hardness < 1.5) &&
        distance < bestDistance
      ) {
        bestPos = pos;
        bestDistance = distance;
      }
    }

    // If no good position found, use the closest one
    if (!bestPos) {
      bestPos = approachPositions.reduce((closest, pos) => {
        const dist = bot.entity.position.distanceTo(pos);
        return dist < bot.entity.position.distanceTo(closest) ? pos : closest;
      });
    }

    console.log("Approaching from position:", bestPos);

    try {
      // Move to the best position to approach the target block
      const goal = new goals.GoalNear(bestPos.x, bestPos.y, bestPos.z, 1);
      await bot.pathfinder.goto(goal);
      console.log("Reached position:", bot.entity.position);

      // Recheck target block after moving
      targetBlock = bot.findBlock({
        matching: mcData.blocksByName[blockType].id,
        maxDistance: 4,
      });

      if (!targetBlock) {
        bot.logChat(
          `Lost sight of ${blockType} after moving! Got ${collected} so far.`
        );
        continue;
      }

      // Check for obstacles between the bot and the target block
      const eyePos = bot.entity.position.offset(0, 1.6, 0); // Approximate eye height
      const targetPos = targetBlock.position.offset(0.5, 0.5, 0.5); // Center of block
      const direction = targetPos.minus(eyePos).normalize();
      const { result } = bot.world.raycast(eyePos, direction, 5);

      // If there's an obstacle and it's not our target block, mine it first
      if (result && result.name !== blockType && result.diggable) {
        bot.logChat(
          `Mining obstacle (${result.name}) to reach ${blockType}...`
        );
        await bot.dig(result);
      }

      // Dig the target block if in range
      if (bot.entity.position.distanceTo(targetBlock.position) <= 4) {
        console.log("Digging target:", targetBlock.position);
        await bot.dig(targetBlock);
        collected++;
        console.log("Collected:", collected);
      }
    } catch (err) {
      console.error("Error during mining operation:", err);
      bot.logChat("Had trouble mining. Trying again...");
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  bot.logChat(`Got ${collected} ${blockType}!`);
}

async function followPlayer(bot, username) {
  const player = bot.players[username];
  if (!player) {
    bot.logChat("I can’t see you!");
    return;
  }
  const goal = new goals.GoalFollow(player.entity, 2);
  bot.pathfinder.setGoal(goal, true);
}

async function dropItems(bot, count) {
  const item = bot.inventory.items()[0];
  if (!item) {
    bot.logChat("Nothing to drop!");
    return;
  }
  await bot.toss(item.type, null, Math.min(count, item.count));
  bot.logChat(`Dropped ${Math.min(count, item.count)} items!`);
}

module.exports = { loadTasks, getBlock, followPlayer, dropItems };
