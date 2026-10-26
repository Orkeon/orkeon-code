// The config store, the declared models and the argument lines the /advisor tests run over.
import { runAdvisorCommand } from "./advisor.ts";
import type { AdvisorOutcome } from "./advisor.ts";
import { CONFIG_FILE_PATH, createConfigStore } from "../../shared/application/config-store.ts";
import { judgeModelChoice } from "../../shared/domain/model-catalog.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakeLogger } from "../../../tests/support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../tests/support/doubles/fake-telemetry.ts";

export interface AdvisorSeed {
  /** The settings file's text, absent when undefined. */
  file?: string;
  /** The models the host declares. */
  models?: string[];
}

export interface AdvisorHarness {
  files: FakeFiles;
  log: FakeLogger;
  /** Runs `/advisor <tokens…>`. */
  run(...tokens: string[]): Promise<AdvisorOutcome>;
  /** The settings file as written, `{}` when absent. */
  fileMap(): Record<string, unknown>;
}

/** /advisor over a config store on FakeFiles and FakeSessionStore, FakeTelemetry declaring `models`, a FakeLogger. */
export function advisorHarness(seed: AdvisorSeed = {}): AdvisorHarness {
  const files = new FakeFiles();
  if (seed.file !== undefined) files.files.set(CONFIG_FILE_PATH, seed.file);
  const telemetry = new FakeTelemetry();
  telemetry.metadata = { availableModels: seed.models ?? [] };
  const log = new FakeLogger();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  return {
    files,
    log,
    run: (...tokens) => runAdvisorCommand(tokens, { config, telemetry, log }),
    fileMap: () => JSON.parse(files.files.get(CONFIG_FILE_PATH) ?? "{}"),
  };
}

/** The words that ask for the second opinion now. */
export const LAUNCH_WORDS: readonly string[] = ["review", "run", "REVIEW"];

export const DECLARED_MODELS: readonly string[] = ["claude-opus", "claude-sonnet"];

/** A settings file that does not parse. */
export const MALFORMED_FILE = "{ not json";

/** What the log says of a model the host does not declare. */
export const UNDECLARED_WARNING = judgeModelChoice(DECLARED_MODELS, "gpt-x").warning;

/** What /advisor says when it sets a model the host does not declare. */
export const UNDECLARED_SET_LINE =
  `advisor model set to 'gpt-x' — persisted in ${CONFIG_FILE_PATH}.\n⚠ NOT among the models this host declares; see the log.`;
