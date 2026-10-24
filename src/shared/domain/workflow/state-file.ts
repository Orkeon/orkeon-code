// The state of a dev batch written before a compaction, `.orkeon/dev/<code>/state-<phase>.md`,
// and the session's pointer to the batch in progress. Pure, no IO.
//
// A compaction may keep the batch sheet in its summary or lose it, and nothing in the
// summary says which steps were closed or which reports came back. The facts are on
// disk, so code writes them before the buffer is rewritten: the TDD lines of the sheet
// and the first open one, the batch's events in Code's own log, the reports recorded,
// the working tree. The file is rewritten at every compaction; the session's start
// script names it again at the next start (scripts/session-start.sh reads its
// `First open:` line and its header's date).
import type { BatchSheet } from "../dev/plan-format.ts";
import { isCode } from "../dev/artefacts.ts";

/** Code's own state folder, in the project. */
export const DEV_STATE_DIR = ".orkeon/dev";

/** The batch a workflow step works on: `code` null when the step did not name it. */
export interface ActiveWorkflow {
  code: string | null;
  phase: string;
}

const PHASE = /^F\d+$/;

/** The pointer as stored (JSON), or null when absent or malformed. */
export function parseActiveWorkflow(raw: string | null): ActiveWorkflow | null {
  if (raw === null || raw.trim().length === 0) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const v = value as { code?: unknown; phase?: unknown };
  if (typeof v.phase !== "string" || !PHASE.test(v.phase)) return null;
  const code = typeof v.code === "string" && isCode(v.code) ? v.code : null;
  return { code, phase: v.phase };
}

export function formatActiveWorkflow(active: ActiveWorkflow): string {
  return JSON.stringify({ code: active.code, phase: active.phase });
}

/** The state file of a batch, relative to the project root. */
export function stateFilePath(code: string, phase: string): string {
  return `${DEV_STATE_DIR}/${code}/state-${phase}.md`;
}

/** Code's event log of a work code, relative to the project root. */
export function batchesStatePath(code: string): string {
  return `${DEV_STATE_DIR}/${code}/batches-state.md`;
}

export interface StateStep {
  label: string;
  tdd: string;
  open: boolean;
}

/** The steps of a sheet that carry a TDD line, in order. */
export function sheetStateSteps(sheet: BatchSheet): StateStep[] {
  const box = (ticked: boolean): string => (ticked ? "[x]" : "[ ]");
  return sheet.steps
    .filter((s) => s.tdd !== null)
    .map((s) => {
      const t = s.tdd!;
      return {
        label: `Step ${s.number} — ${s.title}`,
        tdd: `RED ${box(t.red)} GREEN ${box(t.green)} COST ${box(t.cost)}`,
        open: !(t.red && t.green && t.cost),
      };
    });
}

export function firstOpenStep(steps: readonly StateStep[]): string | null {
  return steps.find((s) => s.open)?.label ?? null;
}

/** At most this many lines of `git status --short` go into the file. */
export const MAX_TREE_LINES = 40;

export interface StateFacts {
  code: string;
  phase: string;
  /** When the file was written (ISO 8601, UTC). */
  at: string;
  trigger: "manual" | "auto";
  /** The sheet, as the work folder shows it ("workbench/demo/DEMO-PLAN-F2.md"). */
  sheet: string;
  steps: StateStep[];
  /** The batch's lines of Code's event log, as written there. */
  events: string[];
  /** The reports recorded for the batch (file names). */
  reports: string[];
  /** `git status --short`, or why there is none. */
  tree: { lines: string[] } | { note: string };
}

/** The file's text. */
export function renderStateFile(f: StateFacts): string {
  const first = firstOpenStep(f.steps);
  const out: string[] = [
    `# State of batch ${f.phase} of ${f.code} — written at ${f.at} before a ${f.trigger} compaction`,
    "",
    `> Read this file first after a compaction. The sheet is \`${f.sheet}\`: resume at its first open step, and`,
    "> tick nothing that was not observed. A report listed below came back already: do not ask for it again.",
    "> Rewritten at every compaction; Orkeon Code never commits it.",
    "",
    "## Steps of the sheet (TDD lines)",
    "",
  ];
  if (f.steps.length === 0) out.push("(the sheet has no step with a TDD line)");
  for (const s of f.steps) out.push(`- ${s.label}: ${s.tdd}`);
  out.push("", first === null ? "No open step: every TDD line is ticked." : `First open: ${first}`, "");
  out.push(`## Events of ${f.phase} in \`${batchesStatePath(f.code)}\``, "");
  out.push(...(f.events.length === 0 ? ["(none)"] : f.events), "");
  out.push(`## Reports recorded for ${f.phase}`, "");
  out.push(...(f.reports.length === 0 ? ["(none)"] : f.reports.map((r) => `- ${r}`)), "");
  out.push("## Working tree (`git status --short`)", "");
  if ("note" in f.tree) {
    out.push(`(${f.tree.note})`);
  } else {
    const shown = f.tree.lines.slice(0, MAX_TREE_LINES);
    out.push("```text", ...(shown.length === 0 ? ["(clean)"] : shown), "```");
    if (f.tree.lines.length > MAX_TREE_LINES) out.push(`(${f.tree.lines.length - MAX_TREE_LINES} more line(s) left out)`);
  }
  return out.join("\n") + "\n";
}
