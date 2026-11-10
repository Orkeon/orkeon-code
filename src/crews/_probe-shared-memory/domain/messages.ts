// The text of the shared-memory recall probe: the errors on its reference set and the rows of its table.

// ── The reference set ────────────────────────────────────────────────────

/** The error of a list field that is not an inline list. */
export function inlineListExpected(where: string): string {
  return `${where}: an inline list [a, b] is expected`;
}

/** The error of a line outside the cases that is no `key: value`. */
export function notTopLevelKey(where: string): string {
  return `${where}: not a top-level key: value`;
}

/** The error of a line inside the cases that is no case field. */
export function notCaseField(where: string): string {
  return `${where}: not a case field`;
}

/** The error of a case key the probe does not know. */
export function unknownCaseKey(where: string, key: string): string {
  return `${where}: unknown case key '${key}'`;
}

/** The error of a missing top-level key. */
export function goldenKeyMissing(key: string): string {
  return `golden: '${key}' is missing`;
}

export const GOLDEN_NO_CASE = "golden: no case";

/** The error of a case id the reference set does not hold. */
export function goldenHasNoCase(id: string): string {
  return `golden.yaml has no case ${id}`;
}

// ── The table ────────────────────────────────────────────────────────────

/** The check of the supersession row. */
export function supersededNeverKept(caseId: string): string {
  return `${caseId} superseded id never kept`;
}

/** The value of the supersession row when nothing superseded was kept. */
export function keptNoneSuperseded(recalled: number): string {
  return `kept ${recalled}, none superseded`;
}

/** The check of the negative row. */
export function rendersNoBlock(caseId: string): string {
  return `${caseId} renders no block`;
}

export const PROBE_TABLE_HEADER = "| Check | Value | Threshold | Result |";
