/// <reference path="../.orkeon/orkeon-cli.d.ts" />
// /effort (E-1, consumed since B-9) — session reasoning-effort level
// (baseline 04 §/effort). The level picks the act() iteration ladder used by
// every subsequent /assistant turn and, since A-3, reaches the provider as
// `act({effort})`: the main loop's act, and the children of /dev-plan and
// dev-verify, which the commands hand the level. The ladder and the forwarding
// rule are pure and tested in shared/domain/agent-policy/behavior-flags.ts.
import { rawTokens } from "../_lib/args.ts";
import { orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { EFFORT_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { EFFORT_LEVELS as LEVELS, EFFORT_MAX_ITERATIONS, DEFAULT_EFFORT } from "../../shared/domain/agent-policy/behavior-flags.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "effort",
  description: "Show or set the session reasoning-effort level (low|medium|high|xhigh|max).",
  handler: async (args, ctx) => {
    const requested = (rawTokens(args)[0] ?? "").toLowerCase();
    if (!requested) {
      const stored = await session.readState(EFFORT_STATE_KEY).catch(() => null);
      const level = stored ?? `${DEFAULT_EFFORT} (default)`;
      const ladder = LEVELS.map((l) => `${l}=${EFFORT_MAX_ITERATIONS[l]}`).join(", ");
      return ctx.continue(
        `reasoning effort: ${level}\nact() iterations per level: ${ladder}\n` +
        `provider thinking: ${stored ? `at '${stored}' (act effort)` : "not requested (no level stored)"}\n` +
        `usage: /effort <${LEVELS.join("|")}>`,
      );
    }
    if (!LEVELS.includes(requested as any))
      return ctx.continue(`unknown level '${requested}' — expected one of: ${LEVELS.join(", ")}.`);
    await session.writeState(EFFORT_STATE_KEY, requested);
    // Says what it buys: the iterations, and the provider's thinking at that level.
    return ctx.continue(
      `reasoning effort set to '${requested}' — the next /assistant turn gets ` +
      `${EFFORT_MAX_ITERATIONS[requested as (typeof LEVELS)[number]]} act() iterations and the provider's ` +
      `thinking at '${requested}' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.`,
    );
  },
});
