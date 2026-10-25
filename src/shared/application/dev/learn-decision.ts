// /dev-learn's decisions: --accept <ids> and --refuse <id | motif text>, and the same
// decisions taken in the run that wrote PROPOSALS.md (crews/dev-learn). Reads the
// proposals and the learning state, writes Orkeon Code's state or refused.md; nothing
// here edits the file a proposal names: an accepted motif prints the change to make.
import type { DevContextDeps } from "./load-dev-context.ts";
import { loadDevContext } from "./load-dev-context.ts";
import type { WorkFolder } from "./resolve-work-folder.ts";
import type { Files, Shell } from "../ports.ts";
import { LEARN_FOLDER_PATTERN, PROPOSALS_JSON, acceptLines, parseProposalsFile } from "../../domain/dev/learn-proposals.ts";
import type { AxisProposal, Motif, ProposalsFile } from "../../domain/dev/learn-proposals.ts";
import { LEARN_STATE_FILE, decisionOf, parseLearnState, serializeLearnState, withDecision } from "../../domain/dev/learn-state.ts";
import type { LearnState } from "../../domain/dev/learn-state.ts";
import { appendRefused, parseRefused, projectFromRemote, topicOf } from "../../domain/shared-memory/refused.ts";
import { readRefusedFile } from "../shared-memory/memory-settings.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export type DevLearnDecisionArgs = { kind: "accept"; ids: string[] } | { kind: "refuse"; target: string };
export type DevLearnDecisionDeps = DevContextDeps & { files: Pick<Files, "read" | "list" | "write">; clock: () => Date };
export interface ProposalsLookup { files: Array<{ folder: string; file: ProposalsFile }>; warnings: string[] }

/** A proposal id: 8 hex digits, 10 on a collision in one file. */
export const PROPOSAL_ID = /^[0-9a-f]{8}([0-9a-f]{2})?$/;

const PROPOSALS_LOOKED_UP = 10;
const LEARN_LIST_CAP = 1000;
const GIT_REMOTE_ORIGIN = "git remote get-url origin";
const MAX_WARNING_LINES = 5;
const MAX_WARNING_CHARS = 200;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isNotFound = (e: unknown): boolean => /not found/i.test(messageOf(e));
const firstLineOf = (e: unknown): string => messageOf(e).split("\n")[0];

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function warningLines(warnings: readonly string[], max: number): string[] {
  const shown = warnings.slice(0, max).map((w) => cut(`warning: ${w}`, MAX_WARNING_CHARS));
  if (warnings.length > max) shown.push(`… ${warnings.length - max} more warnings`);
  return shown;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The file's text, null when it does not exist; any other read failure throws. */
async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

interface FoundMotif { motif: Motif; axis: AxisProposal; key: string }

/** The proposals.json of the 10 newest learn-<date>/ folders, newest first; a bad one is a warning. */
export async function readProposals(files: Pick<Files, "read" | "list">, work: WorkFolder, vfsPath: string): Promise<ProposalsLookup> {
  const lookup: ProposalsLookup = { files: [], warnings: [] };
  let names: string[];
  try {
    names = await files.list(vfsPath, LEARN_LIST_CAP);
  } catch (e) {
    lookup.warnings.push(`${work.folder}/ cannot be listed (${firstLineOf(e)})`);
    return lookup;
  }
  const folders = names.filter((n) => LEARN_FOLDER_PATTERN.test(n)).sort().reverse().slice(0, PROPOSALS_LOOKED_UP);
  for (const folder of folders) {
    const shown = `${work.folder}/${folder}/${PROPOSALS_JSON}`;
    let text: string;
    try {
      text = await files.read(`${vfsPath}/${folder}/${PROPOSALS_JSON}`);
    } catch (e) {
      lookup.warnings.push(`${shown} cannot be read (${firstLineOf(e)})`);
      continue;
    }
    const parsed = parseProposalsFile(text);
    if (!parsed.ok) lookup.warnings.push(`${shown} cannot be read (${parsed.problem})`);
    else lookup.files.push({ folder, file: parsed.file });
  }
  return lookup;
}

function findMotif(lookup: ProposalsLookup, id: string): FoundMotif | null {
  for (const { folder, file } of lookup.files) {
    for (const axis of file.axes) {
      const motif = axis.motifs.find((m) => m.id === id);
      if (motif) return { motif, axis, key: `${folder}\n${axis.axis}` };
    }
  }
  return null;
}

/** The port of --treat-axis: an axis whose every motif is decided has its shown rows treated. */
function completeAxes(state: LearnState, touched: ReadonlyMap<string, AxisProposal>, lines: string[]): LearnState {
  let next = state;
  for (const axis of touched.values()) {
    if (axis.motifs.length === 0 || !axis.motifs.every((m) => decisionOf(next, m.id) !== undefined)) continue;
    next = { ...next, treated: [...new Set([...next.treated, ...axis.shownRows])].sort() };
    lines.push(`axis ${axis.axis} done: ${axis.shownRows.length} gaps marked treated`);
  }
  return next;
}

type StateLoad = { ok: true; state: LearnState } | { ok: false; text: string };

async function loadLearnState(files: Pick<Files, "read">): Promise<StateLoad> {
  let text: string | null;
  try {
    text = await readOrNull(files, `${WORKSPACE}/${LEARN_STATE_FILE}`);
  } catch (e) {
    return { ok: false, text: `dev-learn: ${LEARN_STATE_FILE} cannot be read (${firstLineOf(e)}): fix or delete it; nothing was written` };
  }
  const read = parseLearnState(text);
  return read.ok ? { ok: true, state: read.state } : { ok: false, text: `dev-learn: ${read.problem}: fix or delete it; nothing was written` };
}

/** Writes the state; the BLOCKED text when the write throws, null when it went through. */
async function saveLearnState(files: Pick<Files, "write">, state: LearnState): Promise<string | null> {
  try {
    await files.write(`${WORKSPACE}/${LEARN_STATE_FILE}`, serializeLearnState(state));
    return null;
  } catch (e) {
    return `dev-learn: BLOCKED — ${LEARN_STATE_FILE} cannot be written (${firstLineOf(e)})`;
  }
}

const notFoundText = (work: WorkFolder, id: string): string =>
  `dev-learn: no proposal ${id} in the 10 newest ${work.folder}/learn-*/ folders`;
const stateLine = (state: LearnState): string => `state: ${LEARN_STATE_FILE} — ${state.treated.length} gaps treated in all`;

async function acceptMotifs(ids: readonly string[], lookup: ProposalsLookup, work: WorkFolder, deps: DevLearnDecisionDeps): Promise<string[]> {
  const load = await loadLearnState(deps.files);
  if (!load.ok) return [load.text];
  const date = dayOf(deps.clock());
  let state = load.state;
  const lines: string[] = [];
  const touched = new Map<string, AxisProposal>();
  for (const id of ids) {
    const found = findMotif(lookup, id);
    const earlier = decisionOf(state, id);
    if (found === null) {
      lines.push(notFoundText(work, id));
    } else if (earlier !== undefined) {
      lines.push(`${id} was already ${earlier.decision} on ${earlier.date}`);
    } else {
      const { motif, axis } = found;
      lines.push(...acceptLines(motif));
      state = withDecision(state, { motif: id, decision: "accepted", date, axis: axis.axis, title: motif.title }, motif.rows);
      touched.set(found.key, axis);
    }
  }
  state = completeAxes(state, touched, lines);
  if (state !== load.state) {
    const blocked = await saveLearnState(deps.files, state);
    if (blocked !== null) return [...lines, blocked];
  }
  return [...lines, stateLine(state)];
}

async function projectName(shell: Pick<Shell, "run">): Promise<string> {
  try {
    const result = await shell.run(GIT_REMOTE_ORIGIN);
    return result.exitCode === 0 ? projectFromRemote(result.stdout) ?? "local" : "local";
  } catch {
    return "local";
  }
}

/** Appends the topic to refused.md unless it is there already; the line to print. */
async function recordRefusal(topic: string, motifText: string, date: string, deps: DevLearnDecisionDeps): Promise<{ ok: boolean; line: string }> {
  // refused.md of memory.dir, the one /memory-admit reads too.
  const refusedFile = await readRefusedFile(deps.config);
  const path = `${WORKSPACE}/${refusedFile}`;
  let previous: string | null;
  try {
    previous = await readOrNull(deps.files, path);
  } catch (e) {
    return { ok: false, line: `dev-learn: ${refusedFile} cannot be read (${firstLineOf(e)}): nothing was written` };
  }
  const already = previous === null ? undefined : parseRefused(previous).motifs.find((m) => m.topic === topic);
  if (already !== undefined) return { ok: true, line: `${topic} was already refused on ${already.date}` };
  const project = await projectName(deps.shell);
  try {
    await deps.files.write(path, appendRefused(previous, { topic, project, date, motif: motifText }));
  } catch (e) {
    return { ok: false, line: `dev-learn: BLOCKED — ${refusedFile} cannot be written (${firstLineOf(e)})` };
  }
  return { ok: true, line: `refused: ${topic} — left out of future proposals (${refusedFile})` };
}

async function refuseMotif(target: string, lookup: ProposalsLookup, work: WorkFolder, deps: DevLearnDecisionDeps): Promise<string[]> {
  const date = dayOf(deps.clock());
  if (!PROPOSAL_ID.test(target)) {
    return [(await recordRefusal(topicOf(target), target, date, deps)).line];
  }
  const found = findMotif(lookup, target);
  if (found === null) return [`${notFoundText(work, target)} (to refuse a motif by its words, write more than an id)`];
  const load = await loadLearnState(deps.files);
  if (!load.ok) return [load.text];
  const earlier = decisionOf(load.state, target);
  if (earlier !== undefined) return [`${target} was already ${earlier.decision} on ${earlier.date}`];
  const { motif, axis } = found;
  const refusal = await recordRefusal(motif.topic, motif.title, date, deps);
  if (!refusal.ok) return [refusal.line];
  const lines = [refusal.line];
  let state = withDecision(load.state, { motif: target, decision: "refused", date, axis: axis.axis, title: motif.title }, motif.rows);
  state = completeAxes(state, new Map([[found.key, axis]]), lines);
  const blocked = await saveLearnState(deps.files, state);
  return blocked !== null ? [...lines, blocked] : [...lines, stateLine(state)];
}

/** --accept / --refuse: reads the proposals and the states, writes Orkeon Code's state or refused.md, returns the text. */
export async function runDevLearnDecision(
  args: DevLearnDecisionArgs,
  deps: DevLearnDecisionDeps,
): Promise<string> {
  const ctx = await loadDevContext(deps);
  const work = ctx.work;
  if (work.vfsPath === null) {
    return `dev-learn: the work folder ${work.folder} is in the main worktree, outside the mounts: run /dev-learn from the main checkout`;
  }
  if (!work.exists) return `dev-learn: no work folder ${work.folder}/: nothing to learn from`;
  const lookup = await readProposals(deps.files, work, work.vfsPath);
  const lines = args.kind === "accept"
    ? await acceptMotifs(args.ids, lookup, work, deps)
    : await refuseMotif(args.target, lookup, work, deps);
  return [...warningLines([...ctx.warnings, ...lookup.warnings], MAX_WARNING_LINES), ...lines].join("\n");
}

const isStateLine = (line: string): boolean => line.startsWith("state: ");

/**
 * The decisions taken in the run that wrote the proposals: `accept` as --accept would take
 * them, then each of `refuse` as --refuse would; one state line, the last, at the end.
 */
export async function decideMotifs(
  accept: readonly string[], refuse: readonly string[], lookup: ProposalsLookup, work: WorkFolder, deps: DevLearnDecisionDeps,
): Promise<string[]> {
  const lines: string[] = [];
  if (accept.length > 0) lines.push(...await acceptMotifs(accept, lookup, work, deps));
  for (const id of refuse) lines.push(...await refuseMotif(id, lookup, work, deps));
  const last = lines.filter(isStateLine).at(-1);
  return [...lines.filter((l) => !isStateLine(l)), ...(last === undefined ? [] : [last])];
}
