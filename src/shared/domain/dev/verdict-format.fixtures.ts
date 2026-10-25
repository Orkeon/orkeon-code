// The demo verdict files and the verdicts written inline, for the verdict file parser.
import { readFileSync } from "node:fs";
import { AUDIT_UNFINISHED_GAP } from "./verdict-format.ts";

/** A file of the demo work folder. */
export const demoFile = (name: string): string =>
  readFileSync(new URL(`../../../../tests/fixtures/dev/workbench/demo/${name}`, import.meta.url), "utf8");

/** The Blocking and Major rows of DEMO-VERIFY-F2.md's GAPS sections, as the learning script would yield them.
 *  Written by hand from the fixture: (severity, axis, gap, evidence, fix) per GAPS row. */
export const F2_PARITY_ROWS: readonly string[][] = [
  ["Blocking", "Test", "The refusal of `a/b` is never exercised", "`tests/commands-dev.test.ts` has no such case",
    "add the case and see it fail first"],
  ["Major", "Scope", "The table shows `open | done` for one batch", "`dev.ts:88`", "print the state the plan line holds"],
  ["Major", "Scope", "The state column still merges two states", "`dev.ts:91`", "print the state the plan line holds"],
];

/** A finished audit, then a resume the budget stopped. */
export const FINISHED_THEN_UNFINISHED =
  "# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n## Verdict — GAPS\n| Major | A | g | e | f |\n" +
  `# X-VERIFY-F1 — 2026-01-02 04:04 — resume\n## Verdict — GAPS\n| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | e | f |\n`;

/** Only an audit the budget stopped. */
export const UNFINISHED_ONLY = `## Verdict — GAPS\n| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | e | f |\n`;

/** Texts without a verdict heading: a title alone, and nothing. */
export const NO_HEADING: readonly { name: string; text: string }[] = [
  { name: "a title alone", text: "# X-VERIFY-F1 — 2026-01-02 03:04 — fast\n" },
  { name: "an empty file", text: "" },
];
