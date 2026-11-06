// /theme [<name>|show]: the console's palette for this session. The start palette is the setting Orkeon:Cli:Tui:Theme.
import type { Chooser } from "../../../shared/application/ports.ts";
import type { CommandView } from "../view.ts";
import { optionsOf } from "./choices.ts";

const THEMES = ["dark", "light", "none"] as const;
type ThemeName = (typeof THEMES)[number];

/** The part of the command context the palette goes through. */
export interface ThemeConsole {
  /** Null on a console without palettes. */
  readonly theme: ThemeName | null;
  setTheme(name: ThemeName): boolean;
}

export interface ThemeDeps {
  console: ThemeConsole;
  /** Where a bare /theme opens a panel, when it can. */
  chooser?: Chooser;
}

const NO_PALETTES = "this console has no palettes.";
const isTheme = (token: string): token is ThemeName => (THEMES as readonly string[]).includes(token);

/** `/theme [<name>|show]`, from the command's raw tokens. No argument opens a panel, or without one shows the palette,
 *  as `show` does. */
export async function runTheme(tokens: string[], deps: ThemeDeps): Promise<CommandView> {
  const { console, chooser } = deps;
  const requested = (tokens[0] ?? "").toLowerCase();
  if (requested && requested !== "show" && !isTheme(requested)) {
    return { text: `unknown theme '${requested}' — expected one of: ${THEMES.join(", ")}, show.` };
  }
  const current = console.theme;
  if (current === null) return { text: NO_PALETTES };

  if (isTheme(requested)) return setTheme(console, requested);
  if (!requested && chooser?.interactive) {
    const answer = await chooser.choose({
      message: "Console palette for this session",
      options: optionsOf(THEMES, current),
    });
    return answer ? setTheme(console, answer.value as ThemeName) : { text: `theme unchanged: ${current}.` };
  }
  return { text: `theme: ${current}\nusage: /theme [<${THEMES.join("|")}>|show]` };
}

function setTheme(console: ThemeConsole, name: ThemeName): CommandView {
  if (!console.setTheme(name)) return { text: NO_PALETTES };
  return { text: `theme set to '${name}' for this session (the setting Orkeon:Cli:Tui:Theme is the start palette).` };
}
