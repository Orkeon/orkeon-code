// Values checkConcurrency and the refusals are tested on.

export interface AcceptedCase {
  name: string;
  raw: unknown;
  value: number;
}

/** Absent or 1 gives 1; 2 to 4 are taken as a number or a digit string. */
export const ACCEPTED: readonly AcceptedCase[] = [
  { name: "undefined", raw: undefined, value: 1 },
  { name: "null", raw: null, value: 1 },
  { name: "the number 1", raw: 1, value: 1 },
  { name: "the string 1", raw: "1", value: 1 },
  { name: "the string 1 between spaces", raw: " 1 ", value: 1 },
  ...[2, 3, 4].flatMap((n) => [
    { name: `the number ${n}`, raw: n, value: n },
    { name: `the string ${n}`, raw: String(n), value: n },
  ]),
];

/** Whole numbers above 4, as a number or a string. */
export const ABOVE_MAX: readonly (number | string)[] = [5, "8"];

export interface RawCase {
  name: string;
  raw: unknown;
}

/** Values that are no whole number from 1. */
export const NOT_WHOLE_FROM_ONE: readonly RawCase[] = [
  { name: "0", raw: 0 },
  { name: "-1", raw: -1 },
  { name: "1.5", raw: 1.5 },
  { name: "the word two", raw: "two" },
  { name: "an empty string", raw: "" },
  { name: "1e1 as a string", raw: "1e1" },
  { name: "true", raw: true },
  { name: "an object", raw: {} },
  { name: "NaN", raw: Number.NaN },
];

/** The modes that ask before shell commands; "" stands for the default mode. */
export const ASKING_MODES: readonly string[] = ["default", "acceptEdits", "plan", "dontAsk", ""];

/** The line refusing concurrency 2 in `mode`. */
export function modeRefusalLine(mode: string): string {
  return `concurrency 2 refused: the session mode ${mode || "default"} asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1`;
}

export interface LetThroughCase {
  name: string;
  n: number;
  mode: string;
}

export const LET_THROUGH: readonly LetThroughCase[] = [
  { name: "2 in bypassPermissions", n: 2, mode: "bypassPermissions" },
  { name: "4 in bypassPermissions between spaces", n: 4, mode: " bypassPermissions " },
  { name: "1 in the default mode", n: 1, mode: "default" },
];
