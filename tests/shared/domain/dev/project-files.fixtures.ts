// git listings and the lists a brief makes of them.

/** git's listing of a checkout: a work folder, .orkeon/ state, a duplicate and blank lines among the sources. */
export const LISTING = [
  "src/stats.js", "workbench/calc/CALC-PLAN.md", "src/math.js", "", ".orkeon/config.json", "src/math.js",
  "package.json", "  src/format.test.js  ", "workbench/calc/capture-F1/table.md",
].join("\n");

export const PARSED: readonly string[] = ["package.json", "src/format.test.js", "src/math.js", "src/stats.js"];

export interface LinesCase { name: string; files: readonly string[]; max?: number; expectedCount: number }

export const LINES_CASES: readonly LinesCase[] = [
  { name: "lists nothing when no file is known", files: [], expectedCount: 0 },
  { name: "lists every file between the heading and the closing line when they fit", files: PARSED, expectedCount: 6 },
  { name: "cuts the list at the bound and closes it with how many are left", files: PARSED, max: 2, expectedCount: 4 },
];

export interface ClosingCase { name: string; max?: number; mentions: readonly string[] }

export const CLOSING_CASES: readonly ClosingCase[] = [
  { name: "closes a whole list saying a name absent from it does not exist", mentions: ["the list is whole", "a name absent from it does not exist"] },
  { name: "closes a cut list saying a name absent above may still exist and glob lists it", max: 2, mentions: ["may still exist", "glob with a pattern lists them"] },
];

/** What the cut line says, in the words a reader acts on. */
export const CUT_LINE_MENTIONS: readonly string[] = ["and 2 more", "may still exist", "glob with a pattern"];

/** What the project list rule says, each part in the words a reader acts on. */
export const LIST_RULE_CASES: readonly { name: string; mentions: readonly string[] }[] = [
  { name: "the list rule sends the reader to the last line to know whether the list is whole", mentions: ["its last line says whether the list is whole"] },
  { name: "the list rule rules out a name absent from a whole list", mentions: ["when it is, a name absent from it does not exist"] },
  { name: "the list rule lets glob decide past a cut", mentions: ["past a cut, glob with a pattern decides"] },
  { name: "the list rule forbids opening a guessed name or a folder", mentions: ["Never open a name you guessed, nor a folder"] },
];
