// Tokens and values for the permission-mode tests.

/** Unknown, differently-cased, empty and nullish tokens: none is a mode. */
export const NOT_MODES: readonly { readonly name: string; readonly token: unknown }[] = [
  { name: "an unknown token", token: "yolo" },
  { name: "acceptedits: case-sensitive on purpose", token: "acceptedits" },
  { name: "dontask, differently cased", token: "dontask" },
  { name: "an empty token", token: "" },
  { name: "null", token: null },
  { name: "undefined", token: undefined },
];

/** The /mode cycle, one step at a time. */
export const CYCLE_STEPS: readonly { readonly from: string; readonly to: string }[] = [
  { from: "default", to: "acceptEdits" },
  { from: "acceptEdits", to: "plan" },
  { from: "plan", to: "bypassPermissions" },
  { from: "bypassPermissions", to: "default" },
];

/** Modes off the cycle, from which it re-enters at default. */
export const UNKNOWN_MODES: readonly string[] = ["yolo", ""];

/** Values that configure no fallback. */
export const ABSENT_FALLBACKS: readonly unknown[] = [undefined, null, "", "   "];

/** Values of any type but a mode. */
export const JUNK_FALLBACKS: readonly { readonly name: string; readonly value: unknown }[] = [
  { name: "a number", value: 42 },
  { name: "an object", value: {} },
  { name: "a list", value: [] },
  { name: "a boolean", value: true },
  { name: "a function", value: () => {} },
];
