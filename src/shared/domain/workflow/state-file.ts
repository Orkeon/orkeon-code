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
import { earlierLinesLeftOut, eventsHeading, NO_OPEN_STEP, NO_STEP_WITH_TDD, readThisFirst, reportsHeading, REWRITTEN_AT_EVERY_COMPACTION, stateFileTitle, STEPS_HEADING, TICK_NOTHING_UNOBSERVED, WORKING_TREE_HEADING } from "./prompts.ts";
import { moreLinesLeftOut } from "../prompts.ts";

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

/** A step title, an event line: cut to this many characters, so a sheet cannot flood the prompt. */
export const MAX_STATE_LINE_CHARS = 160;
/** At most this many event lines go into the file (the last ones). */
export const MAX_EVENT_LINES = 40;

export function boundLine(line: string): string {
  return line.length <= MAX_STATE_LINE_CHARS ? line : line.slice(0, MAX_STATE_LINE_CHARS - 1) + "…";
}

/** The steps of a sheet that carry a TDD line, in order. */
export function sheetStateSteps(sheet: BatchSheet): StateStep[] {
  const box = (ticked: boolean): string => (ticked ? "[x]" : "[ ]");
  return sheet.steps
    .filter((s) => s.tdd !== null)
    .map((s) => {
      const t = s.tdd!;
      return {
        label: boundLine(`Step ${s.number} — ${s.title}`),
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
    stateFileTitle(f.phase, f.code, f.at, f.trigger),
    "",
    readThisFirst(f.sheet),
    TICK_NOTHING_UNOBSERVED,
    REWRITTEN_AT_EVERY_COMPACTION,
    "",
    STEPS_HEADING,
    "",
  ];
  if (f.steps.length === 0) out.push(NO_STEP_WITH_TDD);
  for (const s of f.steps) out.push(`- ${s.label}: ${s.tdd}`);
  out.push("", first === null ? NO_OPEN_STEP : `First open: ${first}`, "");
  out.push(eventsHeading(f.phase, batchesStatePath(f.code)), "");
  const events = f.events.slice(-MAX_EVENT_LINES).map(boundLine);
  if (f.events.length > MAX_EVENT_LINES) out.push(earlierLinesLeftOut(f.events.length - MAX_EVENT_LINES));
  out.push(...(events.length === 0 ? ["(none)"] : events), "");
  out.push(reportsHeading(f.phase), "");
  out.push(...(f.reports.length === 0 ? ["(none)"] : f.reports.map((r) => `- ${boundLine(r)}`)), "");
  out.push(WORKING_TREE_HEADING, "");
  if ("note" in f.tree) {
    out.push(`(${f.tree.note})`);
  } else {
    const shown = f.tree.lines.slice(0, MAX_TREE_LINES).map(boundLine);
    out.push("```text", ...(shown.length === 0 ? ["(clean)"] : shown), "```");
    if (f.tree.lines.length > MAX_TREE_LINES) out.push(moreLinesLeftOut(f.tree.lines.length - MAX_TREE_LINES));
  }
  return out.join("\n") + "\n";
}
