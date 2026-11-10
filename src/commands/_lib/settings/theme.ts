// /theme [<name>|show]: the console's palette for this session. The start palette is the setting Orkeon:Cli:Tui:Theme.
import type { Chooser, ThemeConsole, ThemeName } from "../../../shared/application/ports.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";
import { NO_PALETTES, THEME_CHOICE, themeSet, themeShown, themeUnchanged, unknownTheme } from "./messages.ts";

const THEMES: readonly ThemeName[] = ["dark", "light", "none"];

export interface ThemeDeps {
  console: ThemeConsole;
  /** Where a bare /theme opens a panel, when it can. */
  chooser?: Chooser;
}

const isTheme = (token: string): token is ThemeName => (THEMES as readonly string[]).includes(token);

/** `/theme [<name>|show]`, from the command's raw tokens. No argument opens a panel, or without one shows the palette,
 *  as `show` does. */
export async function runTheme(tokens: string[], deps: ThemeDeps): Promise<CommandView> {
  const { console, chooser } = deps;
  const requested = (tokens[0] ?? "").toLowerCase();
  if (requested && requested !== "show" && !isTheme(requested)) {
    return { text: unknownTheme(requested, THEMES) };
  }
  const current = console.theme;
  if (current === null) return { text: NO_PALETTES };

  if (isTheme(requested)) return setTheme(console, requested);
  if (!requested && chooser?.interactive) {
    const answer = await chooser.choose({
      message: THEME_CHOICE,
      options: optionsOf(THEMES, current),
    });
    return answer ? setTheme(console, answer.value as ThemeName) : { text: themeUnchanged(current) };
  }
  return { text: themeShown(current, THEMES) };
}

function setTheme(console: ThemeConsole, name: ThemeName): CommandView {
  if (!console.setTheme(name)) return { text: NO_PALETTES };
  return { text: themeSet(name) };
}
