// The harness /effort runs over, and the texts it answers that run past a line.
import { runEffort } from "../../../../src/commands/_lib/settings/effort.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeReasoningReader } from "../../../support/doubles/fake-reasoning-reader.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { GLM_TAKES, HIGH_AS_ASKED, MEDIUM_LOWERED } from "../../../support/fixtures/reasoning.ts";

export function effortHarness() {
  const session = new FakeSessionStore();
  const chooser = new FakeChooser();
  chooser.interactive = false;
  const run = (...tokens: string[]): Promise<CommandView> => runEffort(tokens, { session, chooser });
  return { session, chooser, run };
}

export const NOTHING_STORED_TEXT =
  "reasoning effort: medium (default)\n" +
  "act() iterations per level: low=10, medium=40, high=80, xhigh=120, max=160\n" +
  "provider thinking: not requested (no level stored)\n" +
  "usage: /effort [<low|medium|high|xhigh|max>|show]";

export const THINKING_STAYS_OFF_TEXT =
  "reasoning effort unchanged: no level is stored, so the provider's thinking stays off (/effort medium turns it on).";

export const SET_HIGH_TEXT =
  "reasoning effort set to 'high' — the next /assistant turn gets 80 act() iterations and the provider's " +
  "thinking at 'high' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.";

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

const SHOWN_HEAD = "act() iterations per level: low=10, medium=40, high=80, xhigh=120, max=160\n";
const USAGE = "\nusage: /effort [<low|medium|high|xhigh|max>|show]";

export const NOTHING_STORED_ON_GLM_TEXT =
  `reasoning effort: medium (default)\n${SHOWN_HEAD}` +
  `provider thinking: not requested (no level stored); glm-5.3 takes low, high, max${USAGE}`;

export const HIGH_ON_GLM_TEXT =
  `reasoning effort: high\n${SHOWN_HEAD}provider thinking: at 'high' (act effort); glm-5.3 takes low, high, max${USAGE}`;

const MEDIUM_NOTE = "glm-5.3 does not take 'medium': 'low' is sent (it takes low, high, max)";

export const MEDIUM_ON_GLM_TEXT =
  `reasoning effort: medium\n${SHOWN_HEAD}provider thinking: at 'medium' (act effort) — ${MEDIUM_NOTE}${USAGE}`;

export const SET_MEDIUM_ON_GLM_TEXT =
  "reasoning effort set to 'medium' — the next /assistant turn gets 40 act() iterations and the provider's " +
  "thinking at 'medium' (act effort; the dev steps and their children too). Session-scoped; /clear clears it.\n" +
  `⚠ effort: ${MEDIUM_NOTE}.`;

export const SET_HIGH_DROPPED_TEXT = `${SET_HIGH_TEXT}\n⚠ effort: plain-1 takes no effort level: none is sent.`;

export const HIGH_UNCHECKED_TEXT =
  `reasoning effort: high\n${SHOWN_HEAD}provider thinking: at 'high' (act effort) — ` +
  `the capability table does not know my-custom: 'high' is sent unchecked${USAGE}`;

export const HIGH_ON_PLAIN_TEXT =
  `reasoning effort: high\n${SHOWN_HEAD}provider thinking: at 'high' (act effort) — plain-1 takes no effort level: none is sent${USAGE}`;
