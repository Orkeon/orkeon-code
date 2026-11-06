// The harness /effort runs over, and the texts it answers that run past a line.
import { runEffort } from "../../../../src/commands/_lib/settings/effort.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

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
