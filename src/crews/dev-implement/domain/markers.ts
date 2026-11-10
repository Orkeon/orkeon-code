// The markers of /dev-implement: the headings, titles and lines a brief or a sheet edit writes and a parser of the
// crew reads back (ADR 0026).

/** The title of a correction step, `Correction C<k> — <finding>`, written by correction.ts and read by the briefs. */
export const CORRECTION_TITLE = /^Correction C(\d+) — (.*)$/;

/** The same title read by the briefs, its label (`C<k>`) whole. */
export const CORRECTION_LABEL = /^Correction (C\d+) — (.*)$/;

export const correctionTitle = (k: number, finding: string): string => `Correction C${k} — ${finding}`;

/** The sheet section that holds the test policy of the batch. */
export const TEST_POLICY_SECTION = "Test policy and scopes";

/** The head of the sheet's `## Assumptions` table. */
export const ASSUMPTIONS_TABLE_HEAD = ["| # | Assumption | To be validated by |", "|---|------------|--------------------|"];

/** The head of a correction step's test table. */
export const STEP_TESTS_TABLE_HEAD = ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|"];

/** The first line of the stale block: what the review of the batch left open once its dependencies merged. */
export const STALE_HEADING = "Stale after the merged dependencies (the reviewer's open questions; settle each by the delivered value it names, or say why not):";

// ── The implementer's Cost line ─────────────────────────────────────────────

const PLACE = "(?:a |any |one )?(?:loops?|lambdas?|memory filters?)";
/** The one "where" that clears a line naming a loop, a lambda or a memory filter: none of them holds a port call. */
export const NONE_WHERE = new RegExp(
  `^(?:none|nothing|no port call(?: (?:in|inside|within) ${PLACE}(?:,? (?:or |nor )?${PLACE})*)?)\\.?$`, "i");
