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

/** The next-step commands, each built from its code, batch and finding or mode. */
export const NEXT_COMMAND_CASES: readonly { name: string; build: "correction" | "close" | "audit"; mode?: "fast" | "full" | "resume"; expected: string }[] = [
  { name: "builds the correction of a batch", build: "correction", expected: "/dev-batches demo F2 — correction: Major Test: x" },
  { name: "builds the close of a batch", build: "close", expected: "/dev-batches demo F2 --close" },
  { name: "builds a fast audit without its mode", build: "audit", mode: "fast", expected: "/dev-batches demo F2 --audit" },
  { name: "builds an audit without a mode", build: "audit", expected: "/dev-batches demo F2 --audit" },
  { name: "builds a resumed audit", build: "audit", mode: "resume", expected: "/dev-batches demo F2 --audit resume" },
];

/** Texts the correction line is read off, with what is read. */
export const CORRECTION_LINE_CASES: readonly { name: string; text: string; expected: { code: string; batch: string; finding: string } | null }[] = [
  {
    name: "reads the correction line after the verdict file's line",
    text: "written: w/demo/DEMO-VERIFY-F2.md — capture: x/\n→ /dev-batches demo F2 — correction: Major Test: x ",
    expected: { code: "demo", batch: "F2", finding: "Major Test: x" },
  },
  {
    name: "reads a plan path as the code",
    text: "→ /dev-batches w/demo/DEMO-PLAN.md F3 — correction: Blocking Scope: y",
    expected: { code: "w/demo/DEMO-PLAN.md", batch: "F3", finding: "Blocking Scope: y" },
  },
  { name: "reads nothing of a close line", text: "→ /dev-batches demo F2 --close", expected: null },
  { name: "reads nothing of a correction quoted inside a line", text: "| Major | the log says → /dev-batches demo F2 — correction: z |", expected: null },
];

/** Lines told apart as a batch's next step or not. */
export const NEXT_STEP_LINE_CASES: readonly { name: string; line: string; expected: boolean }[] = [
  { name: "takes a correction line", line: "→ /dev-batches demo F2 — correction: Major Test: x", expected: true },
  { name: "takes an indented close line", line: "  → /dev-batches demo F2 --close", expected: true },
  { name: "leaves the line that explains the correction", line: "  it appends the gap to the sheet as a new step and runs it", expected: false },
  { name: "leaves the run of a plan", line: "→ /dev-batches demo", expected: false },
];
