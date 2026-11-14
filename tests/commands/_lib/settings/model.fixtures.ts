// The harness /model runs over (FakeSessionStore, FakeTelemetry reporting kimi-k3 and a catalogue of two, FakeLogger),
// and the texts it answers that run past a line.
import { runModel } from "../../../../src/commands/_lib/settings/model.ts";
import { NO_MODEL_REPORTED } from "../../../../src/commands/_lib/settings/messages.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { createConfigStore, USER_CONFIG_FILE_PATH } from "../../../../src/shared/application/config-store.ts";
import { renderModelList } from "../../../../src/shared/domain/model-catalog.ts";
import { NO_CATALOGUE_NOTE } from "../../../../src/shared/domain/messages.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import type { ReasoningAnswers } from "../../../support/doubles/fake-reasoning-reader.ts";
import { GLM_TAKES, HIGH_DROPPED, MEDIUM_LOWERED } from "../../../support/fixtures/reasoning.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";

export const USAGE = "usage: /model <name> | /model list | /model reset | /model show";

export const DECLARED = ["kimi-k3", "deepseek-chat"];

/** /model over a host booted on kimi-k3 that declares kimi-k3 and deepseek-chat; `profile`, when given, is the
 *  `llm.profile` of the user settings. */
export function modelHarness(profile?: string) {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  telemetry.metadata = { model: "kimi-k3", availableModels: [...DECLARED] };
  const log = new FakeLogger();
  const files = new FakeFiles();
  if (profile !== undefined) files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "llm.profile": profile }));
  const config = createConfigStore({ files, session });
  const reasoning = new FakeReasoningReader();
  const run = (...tokens: string[]): Promise<CommandView> => runModel(tokens, { session, telemetry, config, log, reasoning });
  const chooser = new FakeChooser();
  const pick = (...tokens: string[]): Promise<CommandView> =>
    runModel(tokens, { session, telemetry, config, log, chooser, reasoning });
  return { session, telemetry, log, run, chooser, pick, reasoning };
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

/** What /model show answers on that host under the llm.profile `guarded`, with deepseek-chat stored by /model. */
export const PROFILE_SHOW_TEXT =
  "effective model for the next turn: the one llm.profile guarded names (the /model override does not apply)\n" +
  "  boot model      : kimi-k3\n" +
  "  session override: deepseek-chat (not sent while llm.profile is set)\n" +
  `declared models (* = effective):\n${renderModelList(DECLARED, "")}\n` +
  USAGE;

/** The warning /model deepseek-chat logs under the llm.profile `guarded`. */
export const PROFILE_SWITCH_WARNING =
  "llm.profile guarded is active: the /model override 'deepseek-chat' is stored but not sent while it is set " +
  "(unset llm.profile to use it)";

/** What /model deepseek-chat answers under the llm.profile `guarded`. */
export const PROFILE_SWITCHED_TEXT = `model set to 'deepseek-chat' — ⚠ ${PROFILE_SWITCH_WARNING}.`;

/** The line under a switch when the stored `medium` goes out as `low` on the model switched to. */
export const MEDIUM_LOWERED_WARNING = "⚠ effort: 'medium' is sent to glm-5.3 as 'low' (it takes low, high, max).";

/** What /model reset answers when the stored `medium` goes out as `low` on the boot model. */
export const RESET_LOWERED_TEXT = `model override cleared — turns go back to kimi-k3.\n${MEDIUM_LOWERED_WARNING}`;

/** What the /model panel answers when deepseek-chat and `medium` are picked together, `high` stored before. */
export const PANEL_BOTH_TEXT = `${SWITCHED_TEXT}\n` +
  "reasoning effort set to 'medium' — the next /assistant turn gets 40 act() iterations and asks the provider for " +
  "thinking at 'medium' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.\n" +
  MEDIUM_LOWERED_WARNING;

/** What the /model panel answers when deepseek-chat is picked and `medium` stays stored. */
export const PANEL_MODEL_ONLY_TEXT = `${SWITCHED_TEXT}\n${MEDIUM_LOWERED_WARNING}`;

/** deepseek-chat as GLM-5.3 on Z.AI: `medium` goes out as `low`, `high` would not be sent at all. */
export const DEEPSEEK_AS_GLM: Record<string, ReasoningAnswers> = {
  "deepseek-chat": { capabilities: GLM_TAKES, reports: { medium: MEDIUM_LOWERED, high: HIGH_DROPPED } },
};
