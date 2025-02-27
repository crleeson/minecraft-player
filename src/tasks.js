const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3").Vec3;

function loadTasks(bot, mcData) {
  bot.loadPlugin(pathfinder);
  const defaultMove = new Movements(bot, mcData);
  defaultMove.digCost = 1;
  defaultMove.canDig = true;
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

  const sourceBlocks = {
    dirt: ["dirt", "grass_block"],
    cobblestone: ["cobblestone", "stone"],
    oak_log: ["oak_log"],
    birch_log: ["birch_log"],
    spruce_log: ["spruce_log"],
    jungle_log: ["jungle_log"],
    acacia_log: ["acacia_log"],
    dark_oak_log: ["dark_oak_log"],
  };

  const validSources = sourceBlocks[blockType] || [blockType];
  const targetIds = validSources
    .map((type) => mcData.blocksByName[type]?.id)
    .filter((id) => id !== undefined);

  let collectedThisTask = 0;
  while (collectedThisTask < quantity) {
    console.log("Bot position before search:", bot.entity.position);
    let targetBlock = bot.findBlock({
      matching: targetIds,
      maxDistance: 32,
    });

    if (!targetBlock) {
      bot.logChat(
        `Ran out of ${blockType} sources nearby! Got ${collectedThisTask} so far.`
      );
      console.log("No target block found within 32 blocks");
      break;
    }

    console.log("Target block:", targetBlock.name, "at", targetBlock.position);

    const adjacentOffsets = [
      new Vec3(1, 0, 0),
      new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1),
      new Vec3(0, 0, -1),
      new Vec3(0, 1, 0),
    ];
    let adjacentPos = null;
    for (const offset of adjacentOffsets) {
      const pos = targetBlock.position.plus(offset);
      const block = bot.blockAt(pos);
      if (block?.name === "air") {
        adjacentPos = pos;
        break;
      }
    }

    if (!adjacentPos) {
      adjacentPos = targetBlock.position.offset(1, 0, 0);
    }

    console.log("Target adjacent position:", adjacentPos);

    let goal = new goals.GoalNear(
      adjacentPos.x,
      adjacentPos.y,
      adjacentPos.z,
      3
    );
    try {
      console.log("Attempting path to:", adjacentPos);
      await bot.pathfinder.goto(goal);
    } catch (err) {
      console.log("Initial path failed:", err.message);
      bot.logChat("Can’t get there—clearing some space!");
      const pos = bot.entity.position;
      const sides = [
        bot.blockAt(pos.offset(1, 0, 0)),
        bot.blockAt(pos.offset(-1, 0, 0)),
        bot.blockAt(pos.offset(0, 0, 1)),
        bot.blockAt(pos.offset(0, 0, -1)),
      ];
      console.log(
        "Surrounding blocks:",
        sides.map((b) => b?.name)
      );
      for (const side of sides) {
        if (side?.diggable && side.name !== "air") {
          console.log("Clearing side:", side.position);
          await bot.dig(side);
          break;
        }
      }
      goal = new goals.GoalNear(adjacentPos.x, adjacentPos.y, adjacentPos.z, 1);
      try {
        await bot.pathfinder.goto(goal);
      } catch (err) {
        bot.logChat(
          `Still stuck—can’t reach ${blockType}! Got ${collectedThisTask} so far.`
        );
        console.log("Retry path failed:", err.message);
        break;
      }
    }
    console.log("Reached position:", bot.entity.position);

    const standingBlock = bot.blockAt(bot.entity.position);
    console.log(
      "Standing on:",
      standingBlock?.name,
      "Diggable:",
      standingBlock?.diggable
    );
    if (
      standingBlock &&
      standingBlock.diggable &&
      standingBlock.name !== "air"
    ) {
      bot.logChat(`Clearing ${standingBlock.name} I’m standing on...`);
      await bot.dig(standingBlock);
    }

    targetBlock = bot.findBlock({
      matching: targetIds,
      maxDistance: 4,
    });

    if (!targetBlock) {
      bot.logChat(
        `Lost sight of ${blockType} source after clearing! Got ${collectedThisTask} so far.`
      );
      continue;
    }

    if (bot.entity.position.distanceTo(targetBlock.position) <= 4) {
      console.log(
        "Digging target:",
        targetBlock.name,
        "at",
        targetBlock.position
      );
      await bot.dig(targetBlock);
      collectedThisTask++;
      console.log("Collected this task:", collectedThisTask);
    } else {
      console.log("Adjusting position to:", targetBlock.position);
      try {
        await bot.pathfinder.goto(
          new goals.GoalNear(
            targetBlock.position.x,
            targetBlock.position.y,
            targetBlock.position.z,
            1
          )
        );
      } catch (err) {
        console.log("Adjust path failed:", err.message);
        // Keep going—entity crash might’ve happened here
      }
    }

    const pos = bot.entity.position;
    const sides = [
      bot.blockAt(pos.offset(1, 0, 0)),
      bot.blockAt(pos.offset(-1, 0, 0)),
      bot.blockAt(pos.offset(0, 0, 1)),
      bot.blockAt(pos.offset(0, 0, -1)),
    ];
    if (sides.every((b) => b?.diggable && b?.name !== "air")) {
      bot.logChat("Oops, I’m stuck—digging out!");
      await bot.dig(sides[0]);
      await bot.pathfinder.goto(new goals.GoalNear(pos.x + 1, pos.y, pos.z, 1));
    }
  }
  bot.logChat(`Got ${collectedThisTask} ${blockType}!`);
}

async function followPlayer(bot, username) {
  const player = bot.players[username];
  if (!player) {
    bot.logChat("I can’t see you!");
    return;
  }

  const pos = bot.entity.position;
  const floorBlock = bot.blockAt(pos.offset(0, -1, 0));
  const headBlock = bot.blockAt(pos.offset(0, 1, 0));
  const sides = [
    bot.blockAt(pos.offset(1, 0, 0)),
    bot.blockAt(pos.offset(-1, 0, 0)),
    bot.blockAt(pos.offset(0, 0, 1)),
    bot.blockAt(pos.offset(0, 0, -1)),
  ];

  console.log(
    "Checking confinement: Floor:",
    floorBlock?.name,
    "Head:",
    headBlock?.name
  );
  console.log(
    "Sides:",
    sides.map((b) => b?.name)
  );

  if (
    floorBlock?.diggable &&
    headBlock?.name === "air" &&
    sides.some((b) => b?.diggable && b?.name !== "air")
  ) {
    bot.logChat("I’m stuck—digging out!");
    let escaped = false;
    for (const side of sides) {
      if (side?.diggable && side.name !== "air") {
        console.log("Digging side:", side.position);
        await bot.dig(side);
        const newPos = side.position;
        try {
          await bot.pathfinder.goto(
            new goals.GoalNear(newPos.x, newPos.y, newPos.z, 1)
          );
          escaped = true;
          console.log("Moved to:", bot.entity.position);
          break;
        } catch (err) {
          console.log("Move after dig failed:", err.message);
        }
      }
    }
    if (!escaped) {
      bot.logChat("Still stuck—trying up!");
      const upBlock = bot.blockAt(pos.offset(0, 2, 0));
      if (upBlock?.diggable && upBlock.name !== "air") {
        await bot.dig(upBlock);
        await bot.pathfinder.goto(
          new goals.GoalNear(pos.x, pos.y + 1, pos.z, 1)
        );
      }
    }
  }

  const goal = new goals.GoalFollow(player.entity, 2);
  bot.pathfinder.setGoal(goal, true);
  console.log("Following:", username, "at", player.entity.position);
}

async function dropItems(bot, count, itemType = null, username = null) {
  const items = itemType
    ? bot.inventory.items().filter((item) => item.name === itemType)
    : bot.inventory.items();
  const item = items[0];
  if (!item) {
    bot.logChat(`Nothing ${itemType || "to drop"}!`);
    return;
  }

  if (username) {
    const player = bot.players[username];
    if (!player) {
      bot.logChat("I can't see you!");
      return;
    }

    // Stop pathfinder and set up new goal
    bot.pathfinder.stop();
    const goal = new goals.GoalNear(
      player.entity.position.x,
      player.entity.position.y,
      player.entity.position.z,
      2
    );

    try {
      // Path to the player
      console.log("Moving to player at:", player.entity.position);
      await bot.pathfinder.goto(goal);

      // Look at the player
      await bot.lookAt(
        player.entity.position.offset(0, player.entity.height, 0)
      );

      // Drop the items
      const dropCount = Math.min(count, item.count);
      await bot.toss(item.type, null, dropCount);
      bot.logChat(`Dropped ${dropCount} ${item.name}!`);
    } catch (error) {
      console.error("Error while trying to drop items:", error);
      bot.logChat("Having trouble reaching you!");
    }
  } else {
    // If no username provided, just drop items at current location
    const dropCount = Math.min(count, item.count);
    await bot.toss(item.type, null, dropCount);
    bot.logChat(`Dropped ${dropCount} ${item.name}!`);
  }
}

module.exports = { loadTasks, getBlock, followPlayer, dropItems };
