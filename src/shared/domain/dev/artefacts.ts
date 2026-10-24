// Dev workflow artefacts: what a file of a work folder is, read from its name alone.
// Pure, no IO. The prefix group follows the harness's own `[A-Za-z0-9][\w.-]*`.

export type ArtefactKind = "spec" | "change" | "plan" | "sheet" | "verdict" | "batches-state";
export interface ArtefactName { kind: ArtefactKind; name: string; prefix: string; batch?: string }

/** A work code: a plain folder name, never a path. */
export const CODE_PATTERN: RegExp = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isCode(value: string): boolean {
  return CODE_PATTERN.test(value) && !value.includes("..");
}

const PREFIX = "([A-Za-z0-9][\\w.-]*)";

// Order matters: a sheet (`-PLAN-F1.md`) is tried before a plan so it never reads as one.
const PATTERNS: Array<{ kind: ArtefactKind; re: RegExp; batch: boolean }> = [
  { kind: "spec", re: /^SPEC-(.+)\.md$/, batch: false },
  { kind: "change", re: /^CHANGE-(.+)\.md$/, batch: false },
  { kind: "sheet", re: new RegExp(`^${PREFIX}-PLAN-(F\\d+)\\.md$`), batch: true },
  { kind: "plan", re: new RegExp(`^${PREFIX}-PLAN\\.md$`), batch: false },
  { kind: "verdict", re: new RegExp(`^${PREFIX}-VERIFY-(F\\d+)\\.md$`), batch: true },
  { kind: "batches-state", re: new RegExp(`^${PREFIX}-BATCHES-STATE\\.md$`), batch: false },
];

export function classifyArtefact(fileName: string): ArtefactName | null {
  for (const p of PATTERNS) {
    const m = p.re.exec(fileName);
    if (!m) continue;
    const out: ArtefactName = { kind: p.kind, name: fileName, prefix: m[1] };
    if (p.batch) out.batch = m[2];
    return out;
  }
  return null;
}

const BATCH_ID = /^F(\d+)$/;

/** F2 before F10; non-F ids last, by text. */
export function compareBatchIds(a: string, b: string): number {
  const ma = BATCH_ID.exec(a);
  const mb = BATCH_ID.exec(b);
  if (ma && mb) {
    const d = Number(ma[1]) - Number(mb[1]);
    return d !== 0 ? d : a < b ? -1 : a > b ? 1 : 0;
  }
  if (ma) return -1;
  if (mb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
