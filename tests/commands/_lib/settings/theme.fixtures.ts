// The harness /theme runs over, and the texts it answers.
import { runTheme } from "../../../../src/commands/_lib/settings/theme.ts";
import type { CommandView } from "../../../../src/commands/_lib/view.ts";
import { FakeChooser } from "../../../support/doubles/fake-chooser.ts";
import { FakeThemeConsole } from "../../../support/doubles/fake-theme-console.ts";

export function themeHarness() {
  const console = new FakeThemeConsole();
  const chooser = new FakeChooser();
  chooser.interactive = false;
  const run = (...tokens: string[]): Promise<CommandView> => runTheme(tokens, { console, chooser });
  return { console, chooser, run };
}

export const DARK_SHOW_TEXT = "theme: dark\nusage: /theme [<dark|light|none>|show]";

export const SET_LIGHT_TEXT =
  "theme set to 'light' for this session (the setting Orkeon:Cli:Tui:Theme is the start palette).";

export const NO_PALETTES_TEXT = "this console has no palettes.";

export const UNKNOWN_THEME_TEXT = "unknown theme 'blue' — expected one of: dark, light, none, show.";
