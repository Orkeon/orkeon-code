// FakeThemeConsole: the console /theme works on. `theme` is its palette, null on a console without palettes and
// undefined on a runtime that has none;
// `refuses` makes it refuse a palette all the same. Every palette asked for lands in `asked`.
import type { ThemeConsole, ThemeName } from "../../../src/shared/application/ports.ts";

export class FakeThemeConsole implements ThemeConsole {
  theme: ThemeName | null | undefined = "dark";
  refuses = false;
  asked: ThemeName[] = [];

  setTheme(name: ThemeName): boolean {
    this.asked.push(name);
    if (this.refuses || !this.theme) return false;
    this.theme = name;
    return true;
  }
}
