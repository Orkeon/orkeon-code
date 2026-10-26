// /advisor: show, set or disable the advisor model (the /config key advisor.model), or ask for the second
// opinion it exists for. Only `review` (or `run`) costs an LLM call: it answers `{ launch: true }` and the
// command starts the advisor crew; every other form answers the lines the command prints.
//
// The model is checked against the host's declared catalogue and warned about, not refused:
// `Llm:AvailableModels` is a hand-written hint that can lag the provider (same rule as /model).
import { CONFIG_FILE_PATH } from "../../shared/application/config-store.ts";
import type { ConfigStore } from "../../shared/application/config-store.ts";
import type { Logger, SessionMetadata, Telemetry } from "../../shared/application/ports.ts";
import { judgeModelChoice } from "../../shared/domain/model-catalog.ts";

export const ADVISOR_KEY = "advisor.model";

export interface AdvisorDeps {
  config: Pick<ConfigStore, "readValue" | "readFile" | "writeFile">;
  telemetry: Pick<Telemetry, "readMetadata">;
  log: Pick<Logger, "warn">;
}

export type AdvisorOutcome = { launch: true } | { lines: string[] };

async function declaredModels(telemetry: AdvisorDeps["telemetry"]): Promise<string[]> {
  const md = await telemetry.readMetadata().catch((): SessionMetadata => ({}));
  return md.availableModels ?? [];
}

/** `/advisor [show | off | review | <model>]`, from the command's raw tokens. */
export async function runAdvisorCommand(tokens: readonly string[], deps: AdvisorDeps): Promise<AdvisorOutcome> {
  const { config, telemetry } = deps;
  const first = (tokens[0] ?? "").toLowerCase();

  // `review` is the only path that costs an LLM call, so it is explicit — a bare
  // /advisor shows the setting and spends nothing.
  if (first === "review" || first === "run") return { launch: true };

  if (tokens.length === 0 || first === "show") {
    const entry = await config.readValue(ADVISOR_KEY);
    const models = await declaredModels(telemetry);
    const lines = [
      entry.value
        ? `advisor model: ${entry.value}  [${entry.source}]`
        : "advisor model: (unset) — /advisor review would ask the SESSION's own model, " +
          "which makes it a self-review and worth much less.",
    ];
    if (models.length > 0) lines.push(`declared models: ${models.join(", ")}`);
    lines.push("usage: /advisor <model> | /advisor off | /advisor review");
    return { lines };
  }

  if (first === "off" || first === "disable" || first === "none") {
    const { map, malformed } = await config.readFile();
    if (malformed) return { lines: [`refusing to write: ${CONFIG_FILE_PATH} could not be parsed.`] };
    delete map[ADVISOR_KEY];
    await config.writeFile(map);
    return { lines: ["advisor model disabled — /advisor review falls back to the session's own model."] };
  }

  // Anything else is the model name.
  const requested = tokens.join(" ").trim();
  const verdict = judgeModelChoice(await declaredModels(telemetry), requested);
  if (verdict.warning) deps.log.warn(verdict.warning);

  const { map, malformed } = await config.readFile();
  if (malformed) {
    return {
      lines: [
        `refusing to write: ${CONFIG_FILE_PATH} exists but could not be parsed, and overwriting ` +
        "it would discard whatever it holds. Fix or delete it, then retry.",
      ],
    };
  }
  map[ADVISOR_KEY] = requested;
  await config.writeFile(map);
  return {
    lines: [
      `advisor model set to '${requested}' — persisted in ${CONFIG_FILE_PATH}.` +
      (verdict.warning ? "\n⚠ NOT among the models this host declares; see the log." : ""),
    ],
  };
}
