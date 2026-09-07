import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { statsFor } from "../dice.js";

registerMainMenuItem({ label: "📊 Stats", data: "dice:stats", order: 20 });

const composer = new Composer<Ctx>();

async function showStats(ctx: Ctx): Promise<void> {
  try {
    const stats = await statsFor(ctx);
    if (stats.totalRolls === 0) {
      await ctx.reply("No rolls yet — tap 🎲 Roll to start.");
      return;
    }
    await ctx.reply(`Rolls: ${stats.totalRolls} · Best: ${stats.bestRoll}`);
  } catch {
    await ctx.reply("Couldn't fetch your stats — try again in a moment.");
  }
}

composer.command("stats", async (ctx) => {
  await showStats(ctx);
});

composer.callbackQuery("dice:stats", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showStats(ctx);
});

export default composer;
