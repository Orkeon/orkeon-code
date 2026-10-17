/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /output-style [<name>|show] (B-7) — the session's answer style, consumed by the
// main-loop prompt assembly (baseline 09 §2 lists output-style among the blocks
// below the cache boundary; baseline 04 §/output-style is the command).
//
// Shaped exactly like /mode: one session-state key, `show` displays without
// changing, /reset-session restores the default. Deliberately NOT a /config key —
// two owners for one setting is how a value ends up read from the layer nobody
// wrote to.
import { rawTokens } from "./_lib/args.ts";
import { orkeonSessionIo } from "../shared/infrastructure/orkeon/wiring.ts";
import { OUTPUT_STYLES, isOutputStyle } from "../shared/domain/agent-policy/output-styles.ts";
import { OUTPUT_STYLE_STATE_KEY } from "../shared/domain/session-keys.ts";

const session = orkeonSessionIo();

// NO top-level `export` in a *.cmd.ts: the loader bundles the file and Jint
// evaluates it in SCRIPT mode, where `export` is a syntax error — the command
// then fails to load with "Unexpected token 'export'" and simply is not there.
// Neither the unit tests nor the esbuild bundle catch it; only a live load does.
// tests/command-surface.test.ts now pins the rule.

defineCommand({
  name: "output-style",
  description: "Show or set the session's answer style (consumed by the assistant's prompt).",
  handler: async (args, ctx) => {
    const requested = (rawTokens(args)[0] ?? "").trim();
    const current = (await session.readState(OUTPUT_STYLE_STATE_KEY)) ?? "default";

    if (!requested || requested === "show") {
      return ctx.continue(
        `output style: ${current}\n` +
        `usage: /output-style [<${OUTPUT_STYLES.join("|")}>|show]\n` +
        (current === "default"
          ? "the default adds no block to the prompt — an unconfigured session is byte-identical to before B-7."
          : "the style is injected as a <system-reminder> below the cache boundary, so it never breaks the prefix cache."),
      );
    }
    if (!isOutputStyle(requested)) {
      return ctx.continue(`unknown style '${requested}' — expected one of: ${OUTPUT_STYLES.join(", ")}, show.`);
    }
    await session.writeState(OUTPUT_STYLE_STATE_KEY, requested);
    return ctx.continue(
      `output style set to '${requested}' — it applies from the next /assistant turn ` +
      "(/reset-session restores 'default').",
    );
  },
});
