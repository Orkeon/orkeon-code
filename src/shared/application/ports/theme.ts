// The palette port: the console's palette for this session. Types only, re-exported by ../ports.ts.

export type ThemeName = "dark" | "light" | "none";

/** The part of the command context the palette goes through; the context itself is the adapter. */
export interface ThemeConsole {
  /** Null on a console without palettes (a plain console). */
  readonly theme: ThemeName | null;
  /** False on a console without palettes, which stays as it is. */
  setTheme(name: ThemeName): boolean;
}
