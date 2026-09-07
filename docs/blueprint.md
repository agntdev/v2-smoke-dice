# V2 Smoke Dice — Bot specification

**Archetype:** custom

**Voice:** playful and concise — write every user-facing message, button label, error, and empty state in this voice.

A compact Telegram bot that lets individual users roll a six-sided die (1–6), tracks per-user total rolls and best roll in a local SQLite database, and provides a one-tap “Roll again” inline button for quick retries. Replies are short and focused: a single-line roll result (plus a single inline button when applicable) and a concise /stats summary.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- casual Telegram users who want a simple dice utility
- users who prefer short, single-line responses and quick repeat actions

## Success criteria

- User issues /roll and immediately receives a single-line message showing an integer 1–6 and an inline "Roll again" button
- Pressing the "Roll again" button triggers a new roll only for the pressing user and returns a new single-line result
- User issues /stats and receives an accurate short summary showing that user's total_rolls and best_roll
- Per-user stats (total_rolls, best_roll) are persisted in local SQLite and survive bot restarts
- Concurrent users can roll without interfering with each other's stats or callbacks

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu and show quick actions: Roll and Stats
- **/roll** (command, actor: user, command: /roll) — Roll a six-sided die and show result with a "Roll again" inline button
  - outputs: single-line roll result message, inline button callback for repeat roll
- **/stats** (command, actor: user, command: /stats) — Show this user's total_rolls and best_roll as a short summary
  - outputs: single-line stats message
- **Roll again** (button, actor: user, callback: roll:again) — Trigger another roll for the pressing user (inline callback)
  - outputs: new single-line roll result message, updated per-user stats stored

## Flows

### Single roll (command)
_Trigger:_ /roll

1. Authenticate sender by Telegram user id (no special auth required)
2. Generate a secure pseudorandom integer in [1,6] using runtime RNG
3. Persist/update per-user stats: create user row if missing, increment total_rolls, update best_roll if result > best_roll
4. Optionally record a Roll row with timestamp and result (see missing_fields for choice)
5. Reply to user with a single-line message e.g. "You rolled: 4" and attach inline button "Roll again"

_Data touched:_ User, Per-user stats, Roll (optional)

### Single roll (callback)
_Trigger:_ callback_query:roll:again

1. Verify callback_query.from.id matches the original message's expected user context (reject if mismatch)
2. Generate a new pseudorandom integer in [1,6]
3. Persist/update per-user stats as above
4. Answer callback and edit or send a new short message with the roll result (consistent UX: send new message rather than editing previous) and include "Roll again" button

_Data touched:_ User, Per-user stats, Roll (optional)

### View stats
_Trigger:_ /stats

1. Lookup invoking user's stats by Telegram user id
2. If no stats found, return a short friendly message indicating zero rolls
3. Send a single-line summary: total rolls and best roll

_Data touched:_ User, Per-user stats

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user identity for per-user scoping
  - fields: telegram_id (integer), display_name (string, optional cached from latest message), first_seen (timestamp)
- **Per-user stats** _(retention: persistent)_ — Aggregated metrics tracked per Telegram user
  - fields: telegram_id (integer, FK), total_rolls (integer), best_roll (integer, 1..6)
- **Roll** _(retention: persistent)_ — Optional detailed roll records (timestamped) if owner chooses to persist history
  - fields: id (integer PK), telegram_id (integer, FK), timestamp (UTC timestamp), result (integer 1..6)

## Integrations

- **Telegram** (required) — Bot API messaging and inline callbacks
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Optional admin-only /reset_stats to clear all per-user stats (if enabled by owner)
- Optional /export_db to download the SQLite file (if owner wants local export enabled)

## Permissions & privacy

- Per-user scope: stats are tracked only by Telegram user id; no cross-user leaderboards or chat-wide statistics are published
- Data is stored locally in a SQLite file on the bot runtime host; no external services are called
- Display name is cached optionally for UX only and is not shared
- No analytics, no payments, no external APIs are used or required by default
- Admin-only commands (if enabled) must be restricted to the owner/admin account(s) only

## Edge cases

- Callback press by a user different from the original message owner: callback must be rejected with a short error answer (e.g. "This button is for another user.")
- High-frequency pressing: guard with light rate limiting per-user (e.g. 1 roll/second) to avoid spam and DB contention
- SQLite busy/lock errors during concurrent writes: use transactions and retry/backoff to avoid lost updates
- Bot placed in groups: treat rolls as per-user (not per-chat). Ensure messages are private replies where possible or document that stats are global to the user across chats
- Bot restarts: ensure durable commits so total_rolls and best_roll persist
- Locale/timezone for roll timestamps: store timestamps in UTC and do not expose timezone unless owner specifies

## Required tests

- Dialog-level: User sends /roll → receives message with integer 1..6 and 'Roll again' button
- Dialog-level: User presses 'Roll again' → new result returned and total_rolls incremented by 1
- Dialog-level: /stats shows correct total_rolls and best_roll after multiple rolls including edge best updates
- Persistence: stats persist after bot restart (verify SQLite file contains updated counters)
- Security: pressing another user's 'Roll again' button returns a rejection and does not change the target user's stats
- Concurrency: multiple users rolling concurrently do not cause incorrect increments or DB corruption
- Error handling: simulated SQLite busy error is retried gracefully and surfaces a friendly error if unrecoverable

## Assumptions

- Die is always a standard six-sided die (1–6) using the runtime pseudorandom generator
- Per-user scope is by Telegram user id only (not per-chat or per-group)
- Replies are intentionally short: single-line result or single-line stats
- No owner notification channel is required
- Owner may optionally enable admin-only maintenance commands; these are not required for core functionality
