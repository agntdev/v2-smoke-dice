import { afterEach, describe, expect, it } from "vitest";
import { buildBot } from "../src/bot.js";
import { setNowForTests } from "../src/dice.js";
import { callbackUpdate, textUpdate } from "../src/toolkit/harness/updates.js";

async function capturedBot() {
  const bot = await buildBot("123456:TEST");
  bot.botInfo = {
    id: 42, is_bot: true, first_name: "TestBot", username: "test_bot",
    can_join_groups: true, can_read_all_group_messages: false,
    supports_inline_queries: false, can_connect_to_business: false, has_main_web_app: false,
  };
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  let messageId = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    const data = (payload ?? {}) as Record<string, unknown>;
    calls.push({ method, payload: data });
    return {
      ok: true,
      result: /^(send|edit)/.test(method)
        ? { message_id: ++messageId, date: 0, chat: { id: 1, type: "private" } }
        : true,
    } as never;
  });
  return { bot, calls };
}

function sentTexts(calls: Array<{ method: string; payload: Record<string, unknown> }>): string[] {
  return calls.filter((call) => call.method === "sendMessage").map((call) => String(call.payload.text));
}

afterEach(() => setNowForTests(undefined));

describe("dice rolls", () => {
  it("keeps totals and best roll isolated by Telegram user", async () => {
    const { bot, calls } = await capturedBot();
    await bot.handleUpdate(textUpdate(1, "/roll", { userId: 7, chatId: 70 }));
    await bot.handleUpdate(textUpdate(2, "/roll", { userId: 7, chatId: 70 }));
    await bot.handleUpdate(textUpdate(3, "/stats", { userId: 7, chatId: 70 }));
    await bot.handleUpdate(textUpdate(4, "/stats", { userId: 8, chatId: 80 }));

    const texts = sentTexts(calls);
    const rolls = texts.filter((text) => text.startsWith("You rolled: "));
    expect(rolls).toHaveLength(2);
    for (const text of rolls) expect(Number(text.slice("You rolled: ".length))).toBeGreaterThanOrEqual(1);
    for (const text of rolls) expect(Number(text.slice("You rolled: ".length))).toBeLessThanOrEqual(6);
    expect(texts).toContainEqual(expect.stringMatching(/^Rolls: 2 · Best: [1-6]$/));
    expect(texts).toContain("No rolls yet — tap 🎲 Roll to start.");
  });

  it("rejects another user's repeat button without creating a roll", async () => {
    const { bot, calls } = await capturedBot();
    await bot.handleUpdate(textUpdate(1, "/roll", { userId: 7, chatId: 70 }));
    await bot.handleUpdate(callbackUpdate(2, "roll:again", { userId: 8, chatId: 70, messageId: 1001 }));
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
    const answer = calls.find((call) => call.method === "answerCallbackQuery");
    expect(answer?.payload.text).toBe("This button is for another user.");
  });

  it("throttles rapid repeat presses", async () => {
    setNowForTests(() => 10_000);
    const { bot, calls } = await capturedBot();
    await bot.handleUpdate(textUpdate(1, "/roll"));
    await bot.handleUpdate(callbackUpdate(2, "roll:again", { messageId: 1001 }));
    await bot.handleUpdate(callbackUpdate(3, "roll:again", { messageId: 1002 }));
    expect(sentTexts(calls).filter((text) => text.startsWith("You rolled: "))).toHaveLength(2);
    const answers = calls.filter((call) => call.method === "answerCallbackQuery");
    expect(answers.at(-1)?.payload.text).toBe("Hold that thought — try again in a second.");
  });
});
