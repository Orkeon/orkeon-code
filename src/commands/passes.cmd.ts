/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /passes (E-1, consumed since B-9) — session reasoning-pass count
// (baseline 04 §/passes). /review runs this many rounds of its three lenses,
// each round told what the previous ones already found.
import { rawTokens } from "./_lib/args.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { PASSES_STATE_KEY } from "../shared/domain/session-keys.ts";
import { MIN_PASSES, MAX_PASSES } from "../shared/domain/agent-policy/behavior-flags.ts";

const session = orkeonSessionIo();

defineCommand({
  name: "passes",
  description: "Show or set the session reasoning-pass count (1-5).",
  handler: async (args, ctx) => {
    const token = (rawTokens(args)[0] ?? "").trim();
    if (!token) {
      const current = (await session.readState(PASSES_STATE_KEY).catch(() => null)) ?? `${MIN_PASSES} (default)`;
      return ctx.continue(
        `reasoning passes: ${current}\n/review runs that many lens rounds.\nusage: /passes <${MIN_PASSES}-${MAX_PASSES}>`,
      );
    }
    const n = Number(token);
    if (!Number.isInteger(n) || n < MIN_PASSES || n > MAX_PASSES)
      return ctx.continue(
        `invalid pass count '${token}' — expected an integer between ${MIN_PASSES} and ${MAX_PASSES}.`,
      );
    await session.writeState(PASSES_STATE_KEY, String(n));
    // n rounds × 3 lenses is n × 3 LLM calls: say so, the cost is the operator's.
    return ctx.continue(
      `reasoning passes set to ${n} — /review will make ${n * 3} lens calls per run ` +
      "(session-scoped; /reset-session clears it).",
    );
  },
});
