// The lines of the audit's answer the batch's chain reads (ADR 0026): the dev-verify crew writes them, chainStep
// (dev-implement.ts) parses them to launch the close.

/** The audit's VALID verdict, at the start of a line: the batch. */
export const VALID_LINE = /^→ Batch (F\d+) VALID\./m;
/** The verdict file the audit wrote: its folder, its code and its batch. */
export const WRITTEN_LINE = /^written: (\S+)\/([A-Za-z0-9][A-Za-z0-9._-]*)-VERIFY-(F\d+)\.md\b/m;
