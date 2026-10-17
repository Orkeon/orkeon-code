/// <reference path="./.orkeon/orkeon-cli.d.ts" />
// /advisor (B-12) — read, set or disable the advisor model, and run the secondary
// review it exists for (baseline 04 §/advisor: "Read, set, or disable the advisor
// model used for secondary review of agent outputs").
//
//   /advisor                 show the setting and what it is for
//   /advisor <model>         set it (persisted in .orkeon/config.json, key advisor.model)
//   /advisor off             disable it
//   /advisor review          run the second opinion on the last exchange, now
//
// The setting is a /config key (B-6), not a private state blob: it belongs to the
// declared key space, it is validated on the way in, and it survives
// /reset-session — the point of choosing a reviewer is that the choice sticks.
//
// The model is checked against the host's declared catalogue and WARNED about, not
// refused: `Llm:AvailableModels` is a hand-written hint that can lag the provider
// (same rule as /model).
import { rawTokens } from "./_lib/args.ts";
import { launchCrew, writeCompleted } from "./_lib/dispatch.ts";
import { createCrewHost } from "../shared/infrastructure/orkeon/crew-host.ts";
import { orkeonConfigStore, orkeonTelemetry } from "../shared/infrastructure/orkeon/wiring.ts";
import { CONFIG_FILE_PATH } from "../shared/application/config-store.ts";
import type { SessionMetadata } from "../shared/application/ports.ts";
import { judgeModelChoice } from "../shared/domain/model-catalog.ts";

const config = orkeonConfigStore();
const telemetry = orkeonTelemetry();

const ADVISOR_KEY = "advisor.model";

async function declaredModels(): Promise<string[]> {
  const md = await telemetry.readMetadata().catch((): SessionMetadata => ({}));
  return md.availableModels ?? [];
}

defineAsyncCommand({
  name: "advisor",
  description: "Show, set or disable the advisor model, or run a second opinion on the last answer.",
  maxConcurrent: 1,
  dispatch: async (args, ctx) => {
    const tokens = rawTokens(args);
    const first = (tokens[0] ?? "").toLowerCase();

    // `review` is the only path that costs an LLM call, so it is explicit — a bare
    // /advisor shows the setting and spends nothing.
    if (first === "review" || first === "run") {
      return launchCrew({ crews: createCrewHost(ctx.services), log: ctx.log }, "advisor", {});
    }

    if (tokens.length === 0 || first === "show") {
      const entry = await config.readValue(ADVISOR_KEY);
      const models = await declaredModels();
      ctx.writeLine(
        entry.value
          ? `advisor model: ${entry.value}  [${entry.source}]`
          : "advisor model: (unset) — /advisor review would ask the SESSION's own model, " +
            "which makes it a self-review and worth much less.",
      );
      if (models.length > 0) ctx.writeLine(`declared models: ${models.join(", ")}`);
      ctx.writeLine("usage: /advisor <model> | /advisor off | /advisor review");
      return;
    }

    if (first === "off" || first === "disable" || first === "none") {
      const { map, malformed } = await config.readFile();
      if (malformed) {
        ctx.writeLine(`refusing to write: ${CONFIG_FILE_PATH} could not be parsed.`);
        return;
      }
      delete map[ADVISOR_KEY];
      await config.writeFile(map);
      ctx.writeLine("advisor model disabled — /advisor review falls back to the session's own model.");
      return;
    }

    // Anything else is the model name.
    const requested = tokens.join(" ").trim();
    const verdict = judgeModelChoice(await declaredModels(), requested);
    if (verdict.warning) ctx.log.warn(verdict.warning);

    const { map, malformed } = await config.readFile();
    if (malformed) {
      ctx.writeLine(
        `refusing to write: ${CONFIG_FILE_PATH} exists but could not be parsed, and overwriting ` +
        "it would discard whatever it holds. Fix or delete it, then retry.",
      );
      return;
    }
    map[ADVISOR_KEY] = requested;
    await config.writeFile(map);
    ctx.writeLine(
      `advisor model set to '${requested}' — persisted in ${CONFIG_FILE_PATH}.` +
      (verdict.warning ? "\n⚠ NOT among the models this host declares; see the log." : ""),
    );
    return;
  },
  completed: (result, ctx) => writeCompleted(ctx, result, "advisor", "✓ advisor → "),
});
