import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { ownsRollButton, rememberRollButton, repeatRollTooSoon, rollFor, rollKeyboard } from "../dice.js";

const composer = new Composer<Ctx>();

composer.callbackQuery("roll:again", async (ctx) => {
  if (!ownsRollButton(ctx)) {
    await ctx.answerCallbackQuery({ text: "This button is for another user.", show_alert: true });
    return;
  }
  if (repeatRollTooSoon(ctx)) {
    await ctx.answerCallbackQuery({ text: "Hold that thought — try again in a second.", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  try {
    const { result } = await rollFor(ctx);
    const message = await ctx.reply(`You rolled: ${result}`, { reply_markup: rollKeyboard() });
    if (ctx.from) rememberRollButton(ctx, message.message_id, ctx.from.id);
  } catch {
    await ctx.reply("Couldn't roll right now — tap Roll again in a moment.");
  }
});

export default composer;
