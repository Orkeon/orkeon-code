// FakeThemeConsole: the console /theme works on. `theme` is its palette, null on a console without palettes;
// `refuses` makes it refuse a palette all the same. Every palette asked for lands in `asked`.
import type { ThemeConsole } from "../../../src/commands/_lib/settings/theme.ts";

type ThemeName = NonNullable<ThemeConsole["theme"]>;

export class FakeThemeConsole implements ThemeConsole {
  theme: ThemeName | null = "dark";
  refuses = false;
  asked: ThemeName[] = [];

  setTheme(name: ThemeName): boolean {
    this.asked.push(name);
    if (this.refuses || this.theme === null) return false;
    this.theme = name;
    return true;
  }
}
