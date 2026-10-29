// The demo verdict files and the verdicts written inline, for the verdict file parser.
import { readFileSync } from "node:fs";
import { AUDIT_UNFINISHED_GAP } from "../../../../src/shared/domain/dev/verdict-format.ts";

/** A file of the demo work folder. */
export const demoFile = (name: string): string =>
  readFileSync(new URL(`../../../fixtures/dev/workbench/demo/${name}`, import.meta.url), "utf8");

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

const section = (when: string, verdict: string, rows: string): string =>
  `# X-VERIFY-F1 — 2026-01-02 ${when} — fast\n\n## Verdict — ${verdict}\n\n${rows}\n`;
const UNFINISHED_ROW = `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: spent | audit again |\n`;
const GAPS_AUDIT = (when: string): string => section(when, "GAPS", "| Major | Test | the empty case is missed | `a.test.ts:4` | add it |\n");
const VALID_AUDIT = (when: string): string => section(when, "VALID", "None.\n");

/** Verdict files and the audit rounds in GAPS each holds since its last VALID, named by the behaviour. */
export const GAPS_ROUNDS: readonly { name: string; text: string; expected: number }[] = [
  { name: "counts no round in a file without a GAPS verdict", text: VALID_AUDIT("01:00"), expected: 0 },
  { name: "counts one round for a single GAPS audit", text: GAPS_AUDIT("01:00"), expected: 1 },
  { name: "counts only the rounds since the last VALID", text: GAPS_AUDIT("01:00") + VALID_AUDIT("02:00") + GAPS_AUDIT("03:00") + GAPS_AUDIT("04:00"), expected: 2 },
  { name: "counts an audit the budget stopped as a round", text: GAPS_AUDIT("01:00") + section("02:00", "GAPS", UNFINISHED_ROW), expected: 2 },
];

/** A GAPS audit with a Blocking, a Major and a Minor row. */
export const THREE_SEVERITIES = section("01:00", "GAPS",
  "| Blocking | Correctness | the parser drops the last line | `parse.ts:12` | keep it |\n" +
  "| Major | Test | the empty case is missed | `a.test.ts:4` | add it |\n" +
  "| Minor | Conventions | a name is long | `parse.ts:3` | shorten it |\n");
export const THREE_SEVERITIES_FINDING =
  "Blocking — the parser drops the last line (`parse.ts:12`); Major — the empty case is missed (`a.test.ts:4`)";

/** Verdict files that hand their relaunch no correction, named by the behaviour. */
export const NO_FINDING: readonly { name: string; text: string }[] = [
  { name: "hands no correction after an audit the budget stopped", text: GAPS_AUDIT("01:00") + section("02:00", "GAPS", UNFINISHED_ROW) },
  { name: "hands no correction after a VALID verdict", text: GAPS_AUDIT("01:00") + VALID_AUDIT("02:00") },
  { name: "hands no correction for a GAPS verdict of Minor rows only", text: section("01:00", "GAPS", "| Minor | Conventions | a name is long | `parse.ts:3` | shorten it |\n") },
];
