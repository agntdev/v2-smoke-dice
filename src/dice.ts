import type { Ctx } from "./bot.js";

export interface DiceStats {
  totalRolls: number;
  bestRoll: number;
}

interface DiceSession {
  diceButtons?: Record<string, number>;
  lastRollAt?: number;
  localDiceStats?: DiceStats;
}

interface DiceEnv {
  CHAT_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> };
  };
}

/** The one clock seam used for button expiry and rate limiting. */
export let now = (): number => Date.now();

export function setNowForTests(clock: (() => number) | undefined): void {
  now = clock ?? (() => Date.now());
}

function session(ctx: Ctx): DiceSession {
  return ctx.session as DiceSession;
}

function runtimeEnv(ctx: Ctx): DiceEnv | undefined {
  return (ctx as Ctx & { env?: DiceEnv }).env;
}

function secureDie(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  // Rejection sampling prevents modulo bias even though it is tiny for six sides.
  const limit = Math.floor(0x1_0000_0000 / 6) * 6;
  while (bytes[0] >= limit) crypto.getRandomValues(bytes);
  return (bytes[0] % 6) + 1;
}

async function diceRequest<T>(ctx: Ctx, userId: number, path: "roll" | "stats", body?: unknown): Promise<T | undefined> {
  const env = runtimeEnv(ctx);
  if (!env?.CHAT_DO) return undefined;
  const stub = env.CHAT_DO.get(env.CHAT_DO.idFromName(`dice:user:${userId}`));
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await stub.fetch(`https://do/dice/${path}`, {
        method: path === "stats" ? "GET" : "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(`dice storage returned ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }
  // The caller presents a friendly error; this preserves the actual failure for logs.
  console.error("[dice] durable storage unavailable", lastError);
  throw new Error("dice storage unavailable");
}

export function rollKeyboard() {
  return { inline_keyboard: [[{ text: "Roll again", callback_data: "roll:again" }]] };
}

export function rememberRollButton(ctx: Ctx, messageId: number, userId: number): void {
  const state = session(ctx);
  const buttons = state.diceButtons ?? {};
  buttons[String(messageId)] = userId;
  state.diceButtons = buttons;
}

export function ownsRollButton(ctx: Ctx): boolean {
  const messageId = ctx.callbackQuery?.message?.message_id;
  if (messageId === undefined || !ctx.from) return false;
  return session(ctx).diceButtons?.[String(messageId)] === ctx.from.id;
}

/** Returns true when this user has pressed a repeat button too quickly. */
export function repeatRollTooSoon(ctx: Ctx): boolean {
  const state = session(ctx);
  const current = now();
  if (state.lastRollAt !== undefined && current - state.lastRollAt < 1_000) return true;
  state.lastRollAt = current;
  return false;
}

export async function rollFor(ctx: Ctx): Promise<{ result: number; stats: DiceStats }> {
  if (!ctx.from) throw new Error("missing sender");
  const result = secureDie();
  const userId = ctx.from.id;
  const displayName = ctx.from.first_name;
  const at = now();
  const durable = await diceRequest<DiceStats>(ctx, userId, "roll", {
    result,
    userId,
    displayName,
    firstSeen: at,
    timestamp: new Date(at).toISOString(),
  });
  if (durable) return { result, stats: durable };

  // The tokenless harness has no Worker durable object. Its session is an
  // ephemeral compatibility cache; production always takes the durable path.
  const state = session(ctx);
  const old = state.localDiceStats ?? { totalRolls: 0, bestRoll: 0 };
  const stats = { totalRolls: old.totalRolls + 1, bestRoll: Math.max(old.bestRoll, result) };
  state.localDiceStats = stats;
  return { result, stats };
}

export async function statsFor(ctx: Ctx): Promise<DiceStats> {
  if (!ctx.from) return { totalRolls: 0, bestRoll: 0 };
  const durable = await diceRequest<DiceStats>(ctx, ctx.from.id, "stats");
  return durable ?? session(ctx).localDiceStats ?? { totalRolls: 0, bestRoll: 0 };
}
