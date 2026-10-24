// The sections of a /dev-verify capture: how one section text is split into files the
// model can read whole, and the small readings each section is made of (a build log, a
// test tail, the classes of a test file). Pure.
export { isTestFile, isTestRoot } from "../../../shared/domain/dev/access-cost.ts";

export const MAX_SECTION_CHARS = 32_000;
export const SECTION_CUT_CHARS = 31_000;
export const MAX_SECTION_PARTS = 10;
export const MAX_DIFF_FILES = 40;
export const MAX_CLASS_FILES = 40;      // AC:354
export const TEST_TAIL_LINES = 15;      // AC:315
export const BUILD_ERROR_LINES = 6;     // AC:211
export const TRAIT_HIT_LINES = 40;      // AC:305

const WHY_CHARS = 120;
const BUILD_LOG_ERROR = /Build FAILED|(^|[^A-Za-z])error [A-Z]+[0-9]+|^exit=[1-9]/m;
const FAILURE_LINE = /error|Error|failed|Failed|FAIL/;
const CLASS_DECL = /\b(class|record)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const DESCRIBE_CALL = /\bdescribe\(\s*["'`]([^"'`]+)["'`]/g;

export interface SectionFile { name: string; content: string }   // "build.txt", "diff-003-2.txt"

function partName(base: string, k: number): string {
  return k === 1 ? `${base}.txt` : `${base}-${k}.txt`;
}

/** One file when the content fits in 32 000 characters, else parts cut on a line break (§ 2.3). */
export function splitSection(base: string, content: string): SectionFile[] {
  if (content.length <= MAX_SECTION_CHARS) return [{ name: partName(base, 1), content }];
  const files: SectionFile[] = [];
  let rest = content;
  for (let k = 1; ; k++) {
    if (rest.length <= MAX_SECTION_CHARS) {
      files.push({ name: partName(base, k), content: rest });
      return files;
    }
    const lastBreak = rest.lastIndexOf("\n", SECTION_CUT_CHARS);
    const end = lastBreak >= 0 ? lastBreak + 1 : SECTION_CUT_CHARS;
    const part = rest.slice(0, end);
    rest = rest.slice(end);
    if (k === MAX_SECTION_PARTS) {
      files.push({ name: partName(base, k), content: `${part}\n[cut: ${rest.length} more characters not captured]\n` });
      return files;
    }
    files.push({ name: partName(base, k), content: `${part}\n[continued in ${partName(base, k + 1)}]\n` });
  }
}

/** 1 → "diff-001". */
export function diffBase(index: number): string {
  return `diff-${String(index).padStart(3, "0")}`;
}

function lines(text: string): string[] {
  const all = text.split("\n").map((l) => l.replace(/\r$/, ""));
  if (all.length > 0 && all[all.length - 1] === "") all.pop();
  return all;
}

/** The first line of the log that marks a failed build (AC:246); null when the log reads green. */
export function buildLogProblem(log: string): string | null {
  for (const l of lines(log)) if (BUILD_LOG_ERROR.test(l)) return l;
  return null;
}

/** The lines a failed build shows, and why it failed in one line of at most 120 characters (AC:274-275). */
export function buildFailure(output: string): { why: string; lines: string[] } {
  const all = lines(output);
  const failing = all.filter((l) => FAILURE_LINE.test(l));
  const shown = failing.length > 0 ? failing.slice(0, BUILD_ERROR_LINES) : all.slice(-BUILD_ERROR_LINES);
  const why = (failing[0] ?? all[all.length - 1] ?? "").slice(0, WHY_CHARS);
  return { why, lines: shown };
}

export function tailLines(text: string, n: number): string[] {
  return n <= 0 ? [] : lines(text).slice(-n);
}

export interface TestRunSummary { passed: number | null; failed: number | null; exit: number | null }

/** The summary of a test run's tail: VSTest, Microsoft.Testing.Platform and Node's runner, and `exit=` (AC:415-420). */
export function testRunSummary(tail: readonly string[]): TestRunSummary {
  let passed = 0;
  let failed = 0;
  let seen = false;
  let exit: number | null = null;
  for (const raw of tail) {
    const l = raw.replace(/\r$/, "");
    const vstest = /Failed: *([0-9]+), *Passed: *([0-9]+)/.exec(l);
    if (vstest) { failed += Number(vstest[1]); passed += Number(vstest[2]); seen = true; }
    let m: RegExpExecArray | null;
    if ((m = /^ *failed: *([0-9]+) *$/.exec(l))) { failed += Number(m[1]); seen = true; }
    if ((m = /^ *succeeded: *([0-9]+) *$/.exec(l))) { passed += Number(m[1]); seen = true; }
    if ((m = /^(ℹ|#) (pass|fail) ([0-9]+)\s*$/.exec(l))) {
      if (m[2] === "pass") passed += Number(m[3]);
      else failed += Number(m[3]);
      seen = true;
    }
    if ((m = /^exit=([0-9]+)/.exec(l))) exit = Number(m[1]);
  }
  return { passed: seen ? passed : null, failed: seen ? failed : null, exit };
}

/** The classes and records a test file declares, sorted, then the names of its describe() calls. */
export function classesIn(source: string): string[] {
  const classes = [...new Set([...source.matchAll(CLASS_DECL)].map((m) => m[2]))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out = [...classes];
  for (const m of source.matchAll(DESCRIBE_CALL)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The basename up to its first "." (AC:341). */
export function typeNameOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.indexOf(".");
  return dot < 0 ? base : base.slice(0, dot);
}

/** The `traits` section: the marker, the sheet's ids, then the first 40 hits as `path:line text`. */
export function traitsSection(marker: string | null, ids: readonly string[], hits: readonly string[] | null): string {
  if (marker === null) return "not checked — the pack has no tests.rule_trait or tests.trait_pattern\n";
  const out = [`marker: ${marker}`, `ids of the sheet: ${ids.join(" ")}`];
  for (const h of (hits ?? []).filter((x) => x !== "").slice(0, TRAIT_HIT_LINES)) out.push(h.replace(/:([0-9]*):/, ":$1 "));
  return `${out.join("\n")}\n`;
}

/**
 * One line of the `test-classes` section. A test file gives its classes; another file gives the
 * test files naming its type, or `why` when they were not searched.
 */
export function testClassesLine(
  path: string, classes: readonly string[] | null, testFiles: readonly string[] | null, why?: string,
): string {
  if (classes !== null) return `${path}: ${classes.length > 0 ? classes.join(", ") : "no class found"}`;
  const found = testFiles === null ? (why ?? "none") : testFiles.length > 0 ? testFiles.join(", ") : "none";
  return `${path} -> tests naming ${typeNameOf(path)}: ${found}`;
}
