/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /effort (E-1, consumed since B-9) — session reasoning-effort level
// (baseline 04 §/effort). The level picks the act() iteration ladder used by
// every subsequent /assistant turn; the ladder itself is pure and tested in
// shared/domain/agent-policy/behavior-flags.ts.
import { rawTokens } from "./_lib/args.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { EFFORT_STATE_KEY } from "../shared/domain/session-keys.ts";
import { EFFORT_LEVELS as LEVELS, EFFORT_MAX_ITERATIONS, DEFAULT_EFFORT } from "../shared/domain/agent-policy/behavior-flags.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "effort",
  description: "Show or set the session reasoning-effort level (low|medium|high).",
  handler: async (args, ctx) => {
    const requested = (rawTokens(args)[0] ?? "").toLowerCase();
    if (!requested) {
      const stored = await session.readState(EFFORT_STATE_KEY).catch(() => null);
      const level = stored ?? `${DEFAULT_EFFORT} (default)`;
      const ladder = LEVELS.map((l) => `${l}=${EFFORT_MAX_ITERATIONS[l]}`).join(", ");
      return ctx.continue(
        `reasoning effort: ${level}\nact() iterations per level: ${ladder}\nusage: /effort <${LEVELS.join("|")}>`,
      );
    }
    if (!LEVELS.includes(requested as any))
      return ctx.continue(`unknown level '${requested}' — expected one of: ${LEVELS.join(", ")}.`);
    await session.writeState(EFFORT_STATE_KEY, requested);
    // Says what it buys, and what it does not: the provider-side reasoning-effort
    // hint is not reachable from script-land, so this is persistence, not depth.
    return ctx.continue(
      `reasoning effort set to '${requested}' — the next /assistant turn gets ` +
      `${EFFORT_MAX_ITERATIONS[requested as (typeof LEVELS)[number]]} act() iterations ` +
      "(tool-calling persistence, not a provider thinking budget). Session-scoped; /reset-session clears it.",
    );
  },
});
