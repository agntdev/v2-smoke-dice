import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import { rememberRollButton, rollFor, rollKeyboard } from "../dice.js";

registerMainMenuItem({ label: "🎲 Roll", data: "dice:roll", order: 10 });

const composer = new Composer<Ctx>();

async function sendRoll(ctx: Ctx): Promise<void> {
  try {
    const { result } = await rollFor(ctx);
    const message = await ctx.reply(`You rolled: ${result}`, { reply_markup: rollKeyboard() });
    if (ctx.from) rememberRollButton(ctx, message.message_id, ctx.from.id);
  } catch {
    await ctx.reply("Couldn't roll right now — tap Roll again in a moment.");
  }
}

composer.command("roll", async (ctx) => {
  await sendRoll(ctx);
});

composer.callbackQuery("dice:roll", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendRoll(ctx);
});

export default composer;
