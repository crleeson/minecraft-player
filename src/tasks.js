const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const Vec3 = require("vec3").Vec3;

function loadTasks(bot, mcData) {
  bot.loadPlugin(pathfinder);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
}

async function getWood(bot, quantity, woodType = "oak", mcData) {
  const blockName = `${woodType}_log`;
  console.log("getWood mcData:", !!mcData);
  console.log("mcData.blocksByName:", !!mcData?.blocksByName);
  console.log(
    "Checking block:",
    blockName,
    "Exists:",
    !!mcData?.blocksByName[blockName]
  );

  bot.logChat(`Heading out to get ${quantity} ${woodType} wood!`);
  if (!mcData?.blocksByName[blockName]) {
    bot.logChat(
      `I don’t know what ${woodType} wood is! Try oak, birch, spruce, etc.`
    );
    return;
  }

  let treeBlock = bot.findBlock({
    matching: mcData.blocksByName[blockName].id,
    maxDistance: 32,
  });

  if (!treeBlock) {
    bot.logChat(`No ${woodType} trees nearby!`);
    return;
  }

  const goal = new goals.GoalNear(
    treeBlock.position.x,
    treeBlock.position.y,
    treeBlock.position.z,
    2
  );
  await bot.pathfinder.goto(goal);

  let collected = 0;
  while (
    collected < quantity &&
    bot.entity.position.distanceTo(treeBlock.position) < 3
  ) {
    await bot.dig(treeBlock);
    collected++;
    const nextBlock = bot.findBlock({
      matching: mcData.blocksByName[blockName].id,
      maxDistance: 5,
    });
    if (nextBlock) treeBlock = nextBlock; // Update treeBlock to next log
    else break;
  }
  bot.logChat(`Got ${collected} ${woodType} wood!`);
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

module.exports = { loadTasks, getWood, followPlayer, dropItems };
