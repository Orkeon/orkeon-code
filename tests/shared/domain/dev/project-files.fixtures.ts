// git listings and the lists a brief makes of them.

/** git's listing of a checkout: a work folder, .orkeon/ state, a duplicate and blank lines among the sources. */
export const LISTING = [
  "src/stats.js", "workbench/calc/CALC-PLAN.md", "src/math.js", "", ".orkeon/config.json", "src/math.js",
  "package.json", "  src/format.test.js  ", "workbench/calc/capture-F1/table.md",
].join("\n");

export const PARSED: readonly string[] = ["package.json", "src/format.test.js", "src/math.js", "src/stats.js"];

export interface LinesCase { name: string; files: readonly string[]; max?: number; expectedCount: number; last: string | null }

export const LINES_CASES: readonly LinesCase[] = [
  { name: "lists nothing when no file is known", files: [], expectedCount: 0, last: null },
  { name: "lists every file under the heading when they fit", files: PARSED, expectedCount: 5, last: "- src/stats.js" },
  { name: "cuts the list at the bound and says how many are left", files: PARSED, max: 2, expectedCount: 4, last: "- … and 2 more: glob lists the rest" },
];
