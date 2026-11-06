// The palette port: the console's palette for this session. Types only, re-exported by ../ports.ts.

export type ThemeName = "dark" | "light" | "none";

/** The part of the command context the palette goes through; the context itself is the adapter. */
export interface ThemeConsole {
  /** Null on a console without palettes, absent on a release runtime (ADR 0013). */
  readonly theme?: ThemeName | null;
  setTheme(name: ThemeName): boolean;
}
