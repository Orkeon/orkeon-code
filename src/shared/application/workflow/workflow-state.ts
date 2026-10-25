// The batch in progress, and its state file written before a compaction (step 0 of the
// compaction pipeline). The pointer is the session's (`workflow_active`, written by the
// step command that starts on a batch); the state is built from files and git only —
// the sheet, Code's event log, the reports recorded, `git status --short` — never from
// the model, so a compaction cannot get it wrong.
import type { Files, SessionStore, Shell } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { WORKFLOW_ACTIVE_STATE_KEY } from "../../domain/session-keys.ts";
import {
  batchesStatePath, firstOpenStep, formatActiveWorkflow, parseActiveWorkflow, renderStateFile, sheetStateSteps,
  stateFilePath,
} from "../../domain/workflow/state-file.ts";
import type { ActiveWorkflow } from "../../domain/workflow/state-file.ts";
import { parseBatchesState } from "../../domain/dev/batches-state.ts";
import type { BatchesLogEntry } from "../../domain/dev/batches-state.ts";
import { listDevCodes, loadDevCode, loadDevContext } from "../dev/load-dev-context.ts";
import type { CodeSheet, DevCode } from "../dev/load-dev-context.ts";
import type { WorkFolder } from "../dev/resolve-work-folder.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export async function readActiveWorkflow(session: Pick<SessionStore, "readState">): Promise<ActiveWorkflow | null> {
  return parseActiveWorkflow(await session.readState(WORKFLOW_ACTIVE_STATE_KEY));
}

export async function writeActiveWorkflow(session: Pick<SessionStore, "writeState">, active: ActiveWorkflow): Promise<void> {
  await session.writeState(WORKFLOW_ACTIVE_STATE_KEY, formatActiveWorkflow(active));
}

export interface WorkflowStateDeps {
  session: Pick<SessionStore, "readState">;
  files: Pick<Files, "read" | "list" | "write">;
  shell: Pick<Shell, "run">;
  config: Pick<ConfigStore, "readValue">;
  clock?: () => Date;
}

/** What step 0 did: the file written (relative to the project) and the first open step,
 *  or why it wrote none although a batch is in progress. */
export type StateWritten = { path: string; firstOpen: string | null } | { skipped: string };

const REPORTS_LISTED = 200;
const CODES_SEARCHED = 50;

const openSheet = (code: DevCode, phase: string): CodeSheet | undefined =>
  code.sheets.find((s) => s.batch === phase && s.sheet.doneDate === undefined);

/** The code and sheet of the batch: the pointer's code, else the first code (by name) with
 *  an open sheet of that batch. */
async function findSheet(
  deps: Pick<WorkflowStateDeps, "files">, work: WorkFolder, active: ActiveWorkflow,
): Promise<{ code: DevCode; sheet: CodeSheet } | { skipped: string }> {
  if (active.code !== null) {
    const lookup = await loadDevCode(deps, work, active.code);
    if (lookup.found === null) return { skipped: `no work code '${active.code}' in ${work.folder}/ (${lookup.reason})` };
    const any = lookup.found.sheets.find((s) => s.batch === active.phase);
    if (any === undefined) return { skipped: `no sheet of ${active.phase} in ${lookup.found.shown}/` };
    if (any.sheet.doneDate !== undefined) return { skipped: `${lookup.found.shown}/${any.name} is done (${any.sheet.doneDate})` };
    return { code: lookup.found, sheet: any };
  }
  const codes = (await listDevCodes(deps, work)).filter((c) => c.sheets > 0).slice(0, CODES_SEARCHED);
  for (const summary of codes) {
    const lookup = await loadDevCode(deps, work, summary.code);
    if (lookup.found === null) continue;
    const sheet = openSheet(lookup.found, active.phase);
    if (sheet !== undefined) return { code: lookup.found, sheet };
  }
  return { skipped: `no open sheet of ${active.phase} in ${work.folder}/` };
}

/** The batch's events: Code's own log when there is one, else the log of the work code's
 *  folder (`<CODE>-BATCHES-STATE.md`, same line shape). */
async function readEvents(files: Pick<Files, "read">, code: DevCode, phase: string): Promise<string[]> {
  let entries: BatchesLogEntry[];
  try {
    entries = parseBatchesState(await files.read(`${WORKSPACE}/${batchesStatePath(code.code)}`)).entries;
  } catch {
    entries = code.state?.state.entries ?? [];
  }
  return entries
    .filter((e) => e.batch === phase)
    .map((e) => `- ${e.date} ${e.time} ${e.batch} ${e.event}${e.detail ? ` ${e.detail}` : ""}`);
}

async function readReports(files: Pick<Files, "list">, folder: string, phase: string): Promise<string[]> {
  let names: string[];
  try {
    names = await files.list(`${folder}/reports`, REPORTS_LISTED);
  } catch {
    return [];
  }
  const ofPhase = new RegExp(`(^|[^A-Za-z0-9])${phase}([^0-9]|$)`);
  return names.map((n) => n.replace(/\/+$/, "")).filter((n) => ofPhase.test(n)).sort();
}

async function readTree(shell: Pick<Shell, "run">): Promise<{ lines: string[] } | { note: string }> {
  try {
    const r = await shell.run("git status --short");
    if (r.exitCode !== 0) return { note: `git status failed: ${(r.stderr || r.stdout).trim().split("\n")[0] || `exit ${r.exitCode}`}` };
    return { lines: r.stdout.split(/\r?\n/).filter((l) => l.trim().length > 0) };
  } catch (error) {
    return { note: `git status could not run: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Write the state file of the batch in progress; null when no batch is. Throws when the
 * work folder cannot be read or the file cannot be written: the caller logs it and goes on.
 */
export async function writeWorkflowState(
  deps: WorkflowStateDeps, trigger: "manual" | "auto",
): Promise<StateWritten | null> {
  const active = await readActiveWorkflow(deps.session);
  if (active === null) return null;
  const { work } = await loadDevContext(deps);
  if (work.vfsPath === null) return { skipped: `the work folder ${work.folder}/ cannot be reached` };
  const found = await findSheet(deps, work, active);
  if ("skipped" in found) return found;

  const { code, sheet } = found;
  const steps = sheetStateSteps(sheet.sheet);
  const path = stateFilePath(code.code, active.phase);
  const text = renderStateFile({
    code: code.code,
    phase: active.phase,
    at: (deps.clock ?? (() => new Date()))().toISOString().replace(/\.\d{3}Z$/, "Z"),
    trigger,
    sheet: `${code.shown}/${sheet.name}`,
    steps,
    events: await readEvents(deps.files, code, active.phase),
    reports: await readReports(deps.files, `${work.vfsPath}/${code.code}`, active.phase),
    tree: await readTree(deps.shell),
  });
  await deps.files.write(`${WORKSPACE}/${path}`, text);
  return { path, firstOpen: firstOpenStep(steps) };
}
