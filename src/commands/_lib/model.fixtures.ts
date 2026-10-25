// The harness /model runs over (FakeSessionStore, FakeTelemetry reporting kimi-k3 and a catalogue of two, FakeLogger),
// and the texts it answers that run past a line.
import { NO_MODEL_REPORTED, runModel } from "./model.ts";
import type { CommandView } from "./view.ts";
import { renderModelList, NO_CATALOGUE_NOTE } from "../../shared/domain/model-catalog.ts";
import { FakeLogger } from "../../../tests/support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../tests/support/doubles/fake-telemetry.ts";

export const USAGE = "usage: /model <name> | /model list | /model reset | /model show";

export const DECLARED = ["kimi-k3", "deepseek-chat"];

/** /model over a host booted on kimi-k3 that declares kimi-k3 and deepseek-chat. */
export function modelHarness() {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  telemetry.metadata = { model: "kimi-k3", availableModels: [...DECLARED] };
  const log = new FakeLogger();
  const run = (...tokens: string[]): Promise<CommandView> => runModel(tokens, { session, telemetry, log });
  return { session, telemetry, log, run };
}

/** What /model show answers on that host, without an override. */
export function bootShowText(): string {
  return "effective model for the next turn: kimi-k3\n" +
    "  boot model      : kimi-k3\n" +
    "  session override: (none)\n" +
    `declared models (* = effective):\n${renderModelList(DECLARED, "kimi-k3")}\n` +
    USAGE;
}

export const NO_MODEL_SHOW_TEXT =
  "effective model for the next turn: (none — see below)\n" +
  `  boot model      : ${NO_MODEL_REPORTED}\n` +
  "  session override: (none)\n" +
  `declared models: ${NO_CATALOGUE_NOTE}\n` +
  USAGE;

export const SWITCHED_TEXT =
  "model set to 'deepseek-chat' — it applies from the next /assistant turn, no relaunch.\n" +
  "It travels over the configured provider, so it must be a model that provider serves; " +
  "/clear (or /model reset) returns to the boot model.";

export const UNDECLARED_TEXT =
  "model set to 'claude x' — ⚠ NOT among the models this host declares " +
  "(kimi-k3, deepseek-chat). Applied anyway; see the log. /model list to review.";
