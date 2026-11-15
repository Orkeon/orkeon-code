// The harness /effort runs over, and the texts it answers that run past a line.
import { runEffort } from "../../../../src/commands/_lib/settings/effort.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { createConfigStore, USER_CONFIG_FILE_PATH } from "../../../../src/shared/application/config-store.ts";
import type { EffortReport } from "../../../../src/shared/domain/agent-policy/reasoning.ts";
import { MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import type { ReasoningAnswers } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import {
  GLM_TAKES, HIGH_AS_ASKED, HIGH_DROPPED, HIGH_UNCHECKED, MEDIUM_DROPPED, MEDIUM_LOWERED, TAKES_NO_EFFORT,
} from "../../../support/fixtures/reasoning.ts";

export function effortHarness() {
  const session = new FakeSessionStore();
  const chooser = new FakeChooser();
  chooser.interactive = false;
  const run = (...tokens: string[]): Promise<CommandView> => runEffort(tokens, { session, chooser });
  return { session, chooser, run };
}

const SHOWN_HEAD = "act() iterations per level: low=10, medium=40, high=80, xhigh=120, max=160\n";
const USAGE = "\nusage: /effort [<low|medium|high|xhigh|max>|show]";

/** What `/effort show` answers with `level` in force and `thinking` after `provider thinking: `. */
const shown = (level: string, thinking: string): string => `reasoning effort: ${level}\n${SHOWN_HEAD}provider thinking: ${thinking}${USAGE}`;

/** What `/effort <level>` answers before any warning. */
const setText = (level: string, iterations: number): string =>
  `reasoning effort set to '${level}' — the next /assistant turn gets ${iterations} act() iterations and asks the ` +
  `provider for thinking at '${level}' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.`;

export const NOTHING_STORED_TEXT = shown("medium (default)", "not requested (no level stored)");

export const NO_THINKING_ASKED_TEXT =
  "reasoning effort unchanged: no level is stored, so the session asks the provider for no thinking (/effort medium asks for it).";

export const SET_HIGH_TEXT = setText("high", 80);

export const UNKNOWN_LEVEL_TEXT = "unknown level 'huge' — expected one of: low, medium, high, xhigh, max, show.";

/** /effort on a host whose model is GLM-5.3: it takes low, high and max, and `medium` goes out as `low`. */
export function glmHarness() {
  const { session, chooser } = effortHarness();
  const reasoning = new FakeReasoningReader();
  reasoning.capabilitiesAnswer = GLM_TAKES;
  reasoning.reports = { medium: MEDIUM_LOWERED, high: HIGH_AS_ASKED };
  const run = (...tokens: string[]): Promise<CommandView> => runEffort(tokens, { session, chooser, reasoning });
  return { session, chooser, reasoning, run };
}

/** /effort under the user settings' `llm.profile large`, whose model is GLM-5.3, with `deepseek-chat` stored by
 *  /model; any other target is one the runtime cannot tell about. */
export function profiledHarness() {
  const session = new FakeSessionStore();
  session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");
  const files = new FakeFiles();
  files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "llm.profile": "large" }));
  const config = createConfigStore({ files, session });
  const reasoning = new FakeReasoningReader();
  reasoning.byProfile = { large: { capabilities: GLM_TAKES, reports: { medium: MEDIUM_LOWERED } } };
  // The host's own model would drop the level: under a profile nothing runs on it, and nothing is said of it.
  reasoning.byModel = { "": DROPPED };
  const run = (...tokens: string[]): Promise<CommandView> => runEffort(tokens, { session, config, reasoning });
  return { session, reasoning, run };
}

export const NOTHING_STORED_ON_GLM_TEXT = shown("medium (default)", "not requested (no level stored); glm-5.3 takes low, high, max");

export const HIGH_ON_GLM_TEXT = shown("high", "at 'high' (act effort); glm-5.3 takes low, high, max");

const MEDIUM_NOTE = "'medium' is sent to glm-5.3 as 'low' (it takes low, high, max)";
const MEDIUM_DROPPED_NOTE = "'medium' is not sent to plain-1 (it takes no effort level)";

export const MEDIUM_ON_GLM_TEXT = shown("medium", `at 'medium' (act effort) — ${MEDIUM_NOTE}`);

export const SET_MEDIUM_ON_GLM_TEXT = `${setText("medium", 40)}\n⚠ effort: ${MEDIUM_NOTE}.`;

/** A level the model takes and the host's settings drop: the model's levels are not the cause, and are left out. */
export const SET_MEDIUM_SWITCHED_OFF_TEXT = `${setText("medium", 40)}\n⚠ effort: 'medium' is not sent to qwen-3.`;

export const SET_HIGH_DROPPED_TEXT = `${SET_HIGH_TEXT}\n⚠ effort: 'high' is not sent to plain-1 (it takes no effort level).`;

export const HIGH_UNCHECKED_TEXT = shown("high", "at 'high' (act effort) — the capability table does not know my-custom: 'high' is sent unchecked");

export const HIGH_ON_PLAIN_TEXT = shown("high", "at 'high' (act effort) — 'high' is not sent to plain-1 (it takes no effort level)");

/** A lowered level on a model the table does not know: no levels named after it. */
export const XHIGH_LOWERED_UNKNOWN_TEXT = shown("xhigh", "at 'xhigh' (act effort) — 'xhigh' is sent to my-custom as 'high'");

/** No level stored, and the host's own configuration asks for one. */
export const HOST_HIGH_ON_GLM_TEXT =
  shown("medium (default)", "not requested by the session; the host asks for 'high'; glm-5.3 takes low, high, max");
export const HOST_MEDIUM_ON_GLM_TEXT = shown("medium (default)", `not requested by the session; the host asks for 'medium' — ${MEDIUM_NOTE}`);

export interface PanelCase { name: string; report: EffortReport; description: string }

/** What the panel says after the iterations of `high`, from what the runtime reports of it. */
export const PANEL_CASES: readonly PanelCase[] = [
  { name: "says in the panel that a level is not sent on a model that takes none", report: HIGH_DROPPED, description: "80 act() iterations, none sent" },
  {
    name: "says nothing in the panel of a level sent unchecked on a model the table does not know",
    report: HIGH_UNCHECKED, description: "80 act() iterations",
  },
];

export interface TargetCase { name: string; override: string; target: { profile: string | null; model: string } }

/** The target /effort show judges, from the /model override stored. */
export const TARGET_CASES: readonly TargetCase[] = [
  { name: "judges the model /model switched to", override: "glm-5.3", target: { profile: null, model: "glm-5.3" } },
  { name: "judges the /model override without the spaces around it", override: " glm-5.3 ", target: { profile: null, model: "glm-5.3" } },
];

const TURNS_LINE = `⚠ effort: ${MEDIUM_NOTE}.`;
const DEV_STEPS_LINE = `⚠ effort, dev steps and sub-agents (the host's model): ${MEDIUM_DROPPED_NOTE}.`;
const LOWERED: ReasoningAnswers = { capabilities: GLM_TAKES, reports: { medium: MEDIUM_LOWERED } };
const DROPPED: ReasoningAnswers = { capabilities: TAKES_NO_EFFORT, reports: { medium: MEDIUM_DROPPED } };
const SILENT: ReasoningAnswers = { capabilities: null, reports: {} };

export interface DevStepsCase { name: string; byModel: Record<string, ReasoningAnswers>; text: string }

/** `/effort medium` under the /model override `glm-5.3`: the turns run on it, the dev steps on the host's model (""). */
export const DEV_STEPS_CASES: readonly DevStepsCase[] = [
  {
    name: "warns apart for the dev steps when the host's own model makes another thing of the level",
    byModel: { "glm-5.3": LOWERED, "": DROPPED }, text: `${setText("medium", 40)}\n${TURNS_LINE}\n${DEV_STEPS_LINE}`,
  },
  {
    name: "warns once when the override and the host's own model make the same thing of the level",
    byModel: { "glm-5.3": LOWERED, "": LOWERED }, text: `${setText("medium", 40)}\n${TURNS_LINE}`,
  },
  {
    name: "warns for the turns alone when the host's own model takes the level",
    byModel: { "glm-5.3": LOWERED, "": SILENT }, text: `${setText("medium", 40)}\n${TURNS_LINE}`,
  },
  {
    name: "warns for the dev steps alone when the override takes the level",
    byModel: { "glm-5.3": SILENT, "": DROPPED }, text: `${setText("medium", 40)}\n${DEV_STEPS_LINE}`,
  },
];

const HOST_MEDIUM_DROPPED: EffortReport = { ...MEDIUM_DROPPED };
const SHOW_DEV_STEPS_LINE = `\n  dev steps and sub-agents (the host's model): ${MEDIUM_DROPPED_NOTE}`;

export interface ShowDevStepsCase { name: string; stored: string | null; byModel: Record<string, ReasoningAnswers>; text: string }

/** `/effort show` under the /model override `glm-5.3`: the thinking line judges it, a second one the host's model (""). */
export const SHOW_DEV_STEPS_CASES: readonly ShowDevStepsCase[] = [
  {
    name: "shows apart what the stored level becomes on the host's own model, for the dev steps",
    stored: "medium", byModel: { "glm-5.3": LOWERED, "": DROPPED },
    text: shown("medium", `at 'medium' (act effort) — ${MEDIUM_NOTE}${SHOW_DEV_STEPS_LINE}`),
  },
  {
    name: "shows one line when the override and the host's own model make the same thing of the stored level",
    stored: "medium", byModel: { "glm-5.3": LOWERED, "": LOWERED },
    text: shown("medium", `at 'medium' (act effort) — ${MEDIUM_NOTE}`),
  },
  {
    name: "shows nothing of the dev steps when the host's own model takes the stored level",
    stored: "medium", byModel: { "glm-5.3": LOWERED, "": SILENT },
    text: shown("medium", `at 'medium' (act effort) — ${MEDIUM_NOTE}`),
  },
  {
    name: "shows apart what the host's own level becomes on the host's own model when none is stored",
    stored: null,
    byModel: { "glm-5.3": { capabilities: GLM_TAKES, reports: {}, hostReport: MEDIUM_LOWERED }, "": { capabilities: TAKES_NO_EFFORT, reports: {}, hostReport: HOST_MEDIUM_DROPPED } },
    text: shown("medium (default)", `not requested by the session; the host asks for 'medium' — ${MEDIUM_NOTE}${SHOW_DEV_STEPS_LINE}`),
  },
];
