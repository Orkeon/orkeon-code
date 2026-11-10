// /advisor: show, set or disable the advisor model (the /config key advisor.model), or ask for the second
// opinion it exists for. Only `review` (or `run`) costs an LLM call: it answers `{ launch: true }` and the
// command starts the advisor crew; every other form answers the lines the command prints.
//
// The model is checked against the host's declared catalogue and warned about, not refused:
// `Llm:AvailableModels` is a hand-written hint that can lag the provider (same rule as /model).
import { CONFIG_FILE_PATH } from "../../../shared/application/config-store.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { Logger, SessionMetadata, Telemetry } from "../../../shared/application/ports.ts";
import { judgeModelChoice } from "../../../shared/domain/model-catalog.ts";
import {
  ADVISOR_DISABLED, ADVISOR_UNSET, ADVISOR_USAGE, advisorModelLine, advisorSet, declaredModelsLine, refusingToOverwrite,
  refusingUnparsed,
} from "./messages.ts";

const ADVISOR_KEY = "advisor.model";

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
      entry.value ? advisorModelLine(entry.value, entry.source) : ADVISOR_UNSET,
    ];
    if (models.length > 0) lines.push(declaredModelsLine(models));
    lines.push(ADVISOR_USAGE);
    return { lines };
  }

  if (first === "off" || first === "disable" || first === "none") {
    const { map, malformed } = await config.readFile();
    if (malformed) return { lines: [refusingUnparsed(CONFIG_FILE_PATH)] };
    delete map[ADVISOR_KEY];
    await config.writeFile(map);
    return { lines: [ADVISOR_DISABLED] };
  }

  // Anything else is the model name.
  const requested = tokens.join(" ").trim();
  const verdict = judgeModelChoice(await declaredModels(telemetry), requested);
  if (verdict.warning) deps.log.warn(verdict.warning);

  const { map, malformed } = await config.readFile();
  if (malformed) {
    return {
      lines: [refusingToOverwrite(CONFIG_FILE_PATH)],
    };
  }
  map[ADVISOR_KEY] = requested;
  await config.writeFile(map);
  return {
    lines: [advisorSet(requested, CONFIG_FILE_PATH, Boolean(verdict.warning))],
  };
}
