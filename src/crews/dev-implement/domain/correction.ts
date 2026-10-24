// A correction of a batch (`/dev-implement F<n> — correction: <finding>`, an audit's gap): a new step of the
// sheet, `### Step <last+1> — Correction C<k> — <finding>`, with one test row and its own TDD line, and an
// `## Anchors` row copied from the step it corrects, so that it runs as any step, RED first. The earlier steps
// and their evidence stay as they are. A finding naming an id the sheet does not carry changes the scope: it is
// refused and routed. Pure, never throws.
import { unfencedLines } from "../../../shared/domain/dev/plan-format.ts";
import { parseImplementSheet } from "./step-section.ts";
import type { ImplementSheet, ImplementStep } from "./step-section.ts";

export type CorrectionEdit =
  | { ok: true; text: string; step: number; title: string; appended: boolean }
  | { ok: false; reason: string };

const IDS = /\b[A-Z][A-Z0-9]*-[0-9]+\b/g;
const CORRECTION_TITLE = /^Correction C(\d+) — (.*)$/;
const MAX_FINDING = 200;

/** The finding on one line, without the table's pipe, cut at 200 characters. */
export function cleanFinding(finding: string): string {
  const one = finding.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return one.length <= MAX_FINDING ? one : `${one.slice(0, MAX_FINDING - 1)}…`;
}

/** The step a finding corrects: the one it names (`step <m>`), else the one whose Anchors paths it names, else the
 *  last step with a TDD line and a test file. */
export function targetStep(sheet: ImplementSheet, finding: string): ImplementStep | null {
  const runnable = sheet.steps.filter((s) => s.tdd !== null && (s.anchor?.testFiles.length ?? 0) > 0);
  const named = /\bstep (\d+)\b/i.exec(finding);
  if (named !== null) {
    const step = runnable.find((s) => s.number === Number(named[1]));
    if (step !== undefined) return step;
  }
  const byPath = runnable.find((s) => [...(s.anchor?.testFiles ?? []), ...(s.anchor?.production ?? [])]
    .some((r) => r.path !== "" && finding.includes(r.path)));
  return byPath ?? runnable[runnable.length - 1] ?? null;
}

function sectionEnd(lines: ReturnType<typeof unfencedLines>, heading: string, total: number): { start: number; end: number } | null {
  const at = lines.findIndex((l) => l.text.trim() === heading);
  if (at < 0) return null;
  const next = lines.slice(at + 1).find((l) => l.text.startsWith("## "));
  return { start: lines[at].line, end: next === undefined ? total + 1 : next.line };
}

/** The sheet with the correction appended; an open correction with the same finding is kept, not appended again. */
export function addCorrection(text: string, findingRaw: string): CorrectionEdit {
  const finding = cleanFinding(findingRaw);
  if (finding === "") return { ok: false, reason: "the correction names no finding: — correction: <finding>" };
  const unknown = [...new Set(finding.match(IDS) ?? [])].filter((id) => !text.includes(id));
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `the finding names ${unknown.join(", ")}, which the sheet does not carry: a new id changes the scope ` +
        "(/dev-change for the change, then /dev-plan), never a correction",
    };
  }
  const sheet = parseImplementSheet(text);
  const corrections = sheet.steps.map((s) => CORRECTION_TITLE.exec(s.title)).filter((m): m is RegExpExecArray => m !== null);
  const same = sheet.steps.find((s) => CORRECTION_TITLE.exec(s.title)?.[2] === finding
    && !(s.tdd?.red && s.tdd.green && s.tdd.cost));
  if (same !== undefined) return { ok: true, text, step: same.number, title: same.title, appended: false };

  const target = targetStep(sheet, finding);
  if (target === null || target.anchor === null) return { ok: false, reason: "the sheet has no step with a test file to correct" };
  const k = corrections.reduce((max, m) => Math.max(max, Number(m[1])), 0) + 1;
  const number = sheet.steps.reduce((max, s) => Math.max(max, s.number), 0) + 1;
  const title = `Correction C${k} — ${finding}`;
  const base = target.tests[0];
  const ids = [...new Set(target.tests.flatMap((t) => t.ids))].join(", ") || "—";

  const raw = text.split("\n");
  const lines = unfencedLines(text);
  const tdd = sectionEnd(lines, "## TDD sequence", raw.length);
  const anchors = sectionEnd(lines, "## Anchors", raw.length);
  if (tdd === null || anchors === null) return { ok: false, reason: "the sheet lacks ## TDD sequence or ## Anchors" };
  const lastRow = lines.filter((l) => l.line > anchors.start && l.line < anchors.end && l.text.startsWith("|")).pop();
  if (lastRow === undefined) return { ok: false, reason: "the sheet's ## Anchors has no row" };

  const cell = (refs: NonNullable<ImplementStep["anchor"]>["testFiles"]): string => refs.length === 0 ? "—"
    : refs.map((r) => `\`${r.line === undefined ? r.path : `${r.path}:${r.line}`}\` — ${r.state === "member" ? `\`${r.member}\`` : "existing"}`).join("; ");
  const anchorRow = `| ${number} — Correction C${k} | ${cell(target.anchor.testFiles)} | ${target.anchor.doubles || "—"} | ${cell(target.anchor.production)} |`;
  const stepBlock = [
    `### Step ${number} — ${title}`,
    `Corrects step ${target.number} (${target.title}); its earlier evidence stays.`,
    "| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|",
    `| 1 | \`C${k}: the test the author names\` | ${base?.level ?? "unit"} | \`${base?.project ?? ""}\` | ${ids} |`,
    "TDD: RED [ ] GREEN [ ] COST [ ]", "",
  ];
  // Anchors first (it may lie after the TDD sequence), so the TDD insertion point keeps its index.
  const out = [...raw];
  const insertAt = (index: number, add: string[]): void => { out.splice(index, 0, ...add); };
  const tddAt = tdd.end - 1;
  const rowAt = lastRow.line;
  if (rowAt > tddAt) { insertAt(rowAt, [anchorRow]); insertAt(tddAt, stepBlock); }
  else { insertAt(tddAt, stepBlock); insertAt(rowAt, [anchorRow]); }
  return { ok: true, text: out.join("\n"), step: number, title, appended: true };
}
