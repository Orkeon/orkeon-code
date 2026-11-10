// The markers of /dev-implement: the headings, titles and lines a brief or a sheet edit writes and a parser of the
// crew reads back (ADR 0026).

/** The title of a correction step, `Correction C<k> — <finding>`, written by correction.ts and read by the briefs. */
export const CORRECTION_TITLE = /^Correction C(\d+) — (.*)$/;

/** The same title read by the briefs, its label (`C<k>`) whole. */
export const CORRECTION_LABEL = /^Correction (C\d+) — (.*)$/;

export const correctionTitle = (k: number, finding: string): string => `Correction C${k} — ${finding}`;

/** The first line of the stale block: what the review of the batch left open once its dependencies merged. */
export const STALE_HEADING = "Stale after the merged dependencies (the reviewer's open questions; settle each by the delivered value it names, or say why not):";

// ── The implementer's Cost line ─────────────────────────────────────────────

const PLACE = "(?:a |any |one )?(?:loops?|lambdas?|memory filters?)";
/** The one "where" that clears a line naming a loop, a lambda or a memory filter: none of them holds a port call. */
export const NONE_WHERE = new RegExp(
  `^(?:none|nothing|no port call(?: (?:in|inside|within) ${PLACE}(?:,? (?:or |nor )?${PLACE})*)?)\\.?$`, "i");

/** The opening of every stop at a batch's close: the close writes it, /dev-batches reads it to tell a close stop. */
export const CLOSE_STOP = "BLOCKED — close:";
