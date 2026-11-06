// The harness /output-style runs over, and the texts it answers that run past a line.
import { runOutputStyle } from "../../../../src/commands/_lib/settings/output-style.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export function outputStyleHarness() {
  const session = new FakeSessionStore();
  const chooser = new FakeChooser();
  chooser.interactive = false;
  const run = (...tokens: string[]): Promise<CommandView> => runOutputStyle(tokens, { session, chooser });
  return { session, chooser, run };
}

const USAGE = "usage: /output-style [<default|concise|explanatory|learning>|show]";

export const DEFAULT_SHOW_TEXT = `output style: default\n${USAGE}\n` +
  "the default adds no block to the prompt — an unconfigured session is byte-identical to before B-7.";

export const CONCISE_SHOW_TEXT = `output style: concise\n${USAGE}\n` +
  "the style is injected as a <system-reminder> below the cache boundary, so it never breaks the prefix cache.";

export const SET_CONCISE_TEXT =
  "output style set to 'concise' — it applies from the next /assistant turn (/clear restores 'default').";

export const UNKNOWN_STYLE_TEXT =
  "unknown style 'loud' — expected one of: default, concise, explanatory, learning, show.";
