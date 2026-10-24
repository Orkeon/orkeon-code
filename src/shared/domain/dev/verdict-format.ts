// Dev workflow verdicts: `<CODE>-VERIFY-F<n>.md`, one dated section per audit (a
// resume appends one). Pure, no IO, never throws. Gap rows are cut as the harness's
// learning script cuts them, so both read the same rows from the same file.
import type { FormatProblem } from "./plan-format.ts";

export type Verdict = "VALID" | "GAPS";

/** The gap of the row /dev-verify writes when the step's budget stopped the audit: not a finding of the code, so
 *  neither the learning harvest nor a resumed audit takes it as one. Its reason goes in the evidence. */
export const AUDIT_UNFINISHED_GAP = "the audit did not finish: the step's budget ran out";

export function isAuditUnfinishedGap(gap: string): boolean {
  return gap.trim() === AUDIT_UNFINISHED_GAP;
}
export type Severity = "Blocking" | "Major" | "Minor";
/** The axes, as the verdict files spell them (LC:34-35). Moved here from crews/dev-verify/domain/audit-answer.ts. */
export const AXES = [
  "Correctness", "Reuse", "Simplification", "Cost", "Placement", "Conventions", "Test", "Plan", "Scope",
] as const;
export type Axis = (typeof AXES)[number];
export interface GapRow { severity: Severity; axis: string; gap: string; evidence: string; expectedFix: string; line: number }
export interface VerdictSection {
  prefix?: string; batch?: string; when?: string; mode?: string;
  verdict: Verdict | null; rows: GapRow[]; none: boolean;
  validations: string[]; notRun: string[]; measure?: string; line: number;
}
export interface VerdictFile { sections: VerdictSection[]; problems: FormatProblem[] }

const TITLE = /^# (\S+)-VERIFY-(F\d+) — (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) — (\S+)$/;
const VERDICT = /^##\s+Verdict\s+—\s+(VALID|GAPS)\s*$/;
const VALIDATIONS = /^Validations: (.+)$/;
const NOT_RUN = /^Not run: (.+)$/;
const MEASURE = /^Measure: (.+)$/;
const SEVERITIES: ReadonlySet<string> = new Set(["Blocking", "Major", "Minor"]);

function emptySection(line: number): VerdictSection {
  return { verdict: null, rows: [], none: false, validations: [], notRun: [], line };
}

export function parseVerdictFile(text: string): VerdictFile {
  const file: VerdictFile = { sections: [], problems: [] };
  let section: VerdictSection | null = null;
  let inside = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trimEnd();
    const line = i + 1;
    if (t.startsWith("#")) {
      inside = false;
      const title = TITLE.exec(t);
      if (title) {
        section = { ...emptySection(line), prefix: title[1], batch: title[2], when: title[3], mode: title[4] };
        file.sections.push(section);
        return;
      }
      const v = VERDICT.exec(t);
      if (v) {
        if (!section || section.verdict !== null) { section = emptySection(line); file.sections.push(section); }
        section.verdict = v[1] as Verdict;
        inside = true;
        return;
      }
      if (/-VERIFY-/.test(t) && t.startsWith("# ")) file.problems.push({ line, message: `unknown verdict title '${t}'` });
      else if (/^##\s+Verdict\b/.test(t)) file.problems.push({ line, message: `unknown verdict line '${t}'` });
      return;
    }
    if (!section) return;
    const current: VerdictSection = section;
    let m: RegExpExecArray | null;
    if ((m = VALIDATIONS.exec(t))) { current.validations.push(m[1]); return; }
    if ((m = NOT_RUN.exec(t))) { current.notRun.push(m[1]); return; }
    if ((m = MEASURE.exec(t))) { current.measure = m[1]; return; }
    if (!inside) return;
    if (t.trim() === "None.") { current.none = true; return; }
    const s = t.trim();
    // A row may omit its edge pipes, as the harness reads it: then its first cell must
    // be a severity, so prose holding a pipe stays silent.
    if (!s.startsWith("|") && !(s.includes("|") && SEVERITIES.has(s.slice(0, s.indexOf("|")).trim()))) return;
    const cells = s.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cells[0] === "Severity" || /^-+$/.test(cells[0].replace(/:/g, ""))) return;
    if (!SEVERITIES.has(cells[0])) { file.problems.push({ line, message: `unknown severity '${cells[0]}'` }); return; }
    if (cells.length < 5) { file.problems.push({ line, message: `malformed gap row '${s}'` }); return; }
    current.rows.push({
      severity: cells[0] as Severity, axis: cells[1], gap: cells.slice(2, -2).join(" | "),
      evidence: cells[cells.length - 2], expectedFix: cells[cells.length - 1], line,
    });
  });
  return file;
}

/** The last section that carries a verdict heading; null when none. */
export function lastVerdict(file: VerdictFile): VerdictSection | null {
  for (let i = file.sections.length - 1; i >= 0; i--) if (file.sections[i].verdict !== null) return file.sections[i];
  return null;
}

/** A section an audit the step's budget stopped wrote: its row judges nothing of the code. */
export function isUnfinishedSection(section: VerdictSection): boolean {
  return section.rows.some((r) => isAuditUnfinishedGap(r.gap));
}

/** The last verdict a finished audit wrote, skipping the sections of audits the budget stopped; null when none. */
export function lastFinishedVerdict(file: VerdictFile): VerdictSection | null {
  for (let i = file.sections.length - 1; i >= 0; i--) {
    const s = file.sections[i];
    if (s.verdict !== null && !isUnfinishedSection(s)) return s;
  }
  return null;
}

export function severityCounts(section: VerdictSection): Record<Severity, number> {
  const counts: Record<Severity, number> = { Blocking: 0, Major: 0, Minor: 0 };
  for (const r of section.rows) counts[r.severity]++;
  return counts;
}
