// /dev-status: where a piece of dev work stands, read from the files the dev workflow
// leaves in the work folder (the global plan, the batch sheets, the verdicts and the
// batches log). Read-only. The use case takes its ports and returns a CommandView;
// dev-status.cmd.ts wires the real ports and shows it.
import type { CommandView } from "./view.ts";
import type { CodeSummary, DevCode, DevContext, DevContextDeps } from "../../shared/application/dev/load-dev-context.ts";
import { loadDevCode, loadDevContext, probeDevCodes } from "../../shared/application/dev/load-dev-context.ts";
import { WORKSPACE_ROOT, workFolderLabel } from "../../shared/application/dev/resolve-work-folder.ts";
import type { WorkFolder } from "../../shared/application/dev/resolve-work-folder.ts";
import type { Files, Shell } from "../../shared/application/ports.ts";
import { LEARN_FOLDER_PATTERN, PROPOSALS_JSON, acceptLines, parseProposalsFile } from "../../shared/domain/dev/learn-proposals.ts";
import type { AxisProposal, Motif, ProposalsFile } from "../../shared/domain/dev/learn-proposals.ts";
import { LEARN_STATE_FILE, decisionOf, parseLearnState, serializeLearnState, withDecision } from "../../shared/domain/dev/learn-state.ts";
import type { LearnState } from "../../shared/domain/dev/learn-state.ts";
import { REFUSED_FILE, appendRefused, parseRefused, projectFromRemote, topicOf } from "../../shared/domain/shared-memory/refused.ts";
import { compareBatchIds, isCode } from "../../shared/domain/dev/artefacts.ts";
import { sheetProgress } from "../../shared/domain/dev/plan-format.ts";
import type { BatchState, PlanBatch } from "../../shared/domain/dev/plan-format.ts";
import { lastVerdict, severityCounts } from "../../shared/domain/dev/verdict-format.ts";
import { readPlanSource, resolvePlanSource } from "../../shared/application/dev/plan-source.ts";
import { blockingStop } from "../../shared/domain/dev/spec-format.ts";

export type DevStatusDeps = DevContextDeps;
export const DEV_STATUS_USAGE = "usage: /dev-status [<code>]";
export const MAX_BATCH_LINES = 20;
export const MAX_WARNING_LINES = 5;
export const MAX_LINE_CHARS = 160;

const MAX_WARNING_CHARS = 200;
const MAX_NAME_CHARS = 40;
const MAX_CODES_LISTED = 30;
const MAX_CODE_ENTRY_CHARS = 60;
const TEXT_BUDGET = 3900;
const SHRUNK_BATCH_LINES = 15;
const SHRUNK_WARNING_LINES = 3;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function contextLines(ctx: DevContext): string[] {
  const packShown = ctx.pack?.shown ?? null;
  return [
    cut(`work folder: ${workFolderLabel(ctx.work, packShown)}`, MAX_LINE_CHARS),
    cut(`pack: ${packShown ?? "none"}`, MAX_LINE_CHARS),
  ];
}

function warningLines(warnings: readonly string[], max: number): string[] {
  const shown = warnings.slice(0, max).map((w) => cut(`warning: ${w}`, MAX_WARNING_CHARS));
  if (warnings.length > max) shown.push(`… ${warnings.length - max} more warnings`);
  return shown;
}

function refusal(ctx: DevContext, text: string): CommandView {
  return { lines: [...contextLines(ctx), ...warningLines(ctx.warnings, MAX_WARNING_LINES)], text };
}

function stateText(batch: PlanBatch | undefined): string {
  if (!batch) return "not in the plan";
  const s: BatchState = batch.state;
  if (s.kind === "open") return "open";
  if (s.kind === "done") return `done ${s.date}`;
  return s.text;
}

function verdictText(code: DevCode, id: string): { text: string; valid: boolean } {
  let section = null;
  for (const v of code.verdicts) if (v.batch === id) section = lastVerdict(v.file) ?? section;
  if (section === null || section.verdict === null) return { text: "no verdict", valid: false };
  const head = [section.verdict, section.when, section.mode].filter((p) => p !== undefined && p !== "").join(" ");
  const counts = severityCounts(section);
  if (section.verdict === "VALID") {
    return { text: counts.Minor > 0 ? `${head} (${counts.Minor} Minor)` : head, valid: true };
  }
  const gaps = [
    counts.Blocking > 0 ? `${counts.Blocking} Blocking` : "",
    counts.Major > 0 ? `${counts.Major} Major` : "",
  ].filter((p) => p !== "");
  return { text: gaps.length > 0 ? `${head}: ${gaps.join(", ")}` : head, valid: false };
}

function runningText(code: DevCode, id: string): string | null {
  const state = code.state?.state;
  if (!state || !state.open.includes(id)) return null;
  const last = [...state.entries].reverse().find((e) => e.batch === id);
  return last ? `running (${last.event} ${last.date} ${last.time})` : "running";
}

/** The batch lines (all of them) and the consistency warnings they raise. */
function batchLines(code: DevCode): { ids: string[]; lines: string[]; warnings: string[] } {
  const planBatches = code.plan?.plan.batches ?? [];
  const ids = [...new Set([
    ...planBatches.map((b) => b.id), ...code.sheets.map((s) => s.batch), ...code.verdicts.map((v) => v.batch),
  ])].filter((id) => id !== "").sort(compareBatchIds);
  const lines: string[] = [];
  const warnings: string[] = [];
  for (const id of ids) {
    const batch = planBatches.find((b) => b.id === id);
    const sheet = code.sheets.find((s) => s.batch === id);
    const name = cut(batch?.name ?? sheet?.sheet.name ?? "", MAX_NAME_CHARS);
    const parts = [name === "" ? id : `${id} ${name}`, stateText(batch)];
    if (batch) parts.push(`boxes ${batch.steps.filter((s) => s.done).length}/${batch.steps.length}`);
    if (sheet) {
      const p = sheetProgress(sheet.sheet);
      const n = p.behaviourSteps;
      parts.push(`sheet RED ${p.red}/${n} GREEN ${p.green}/${n} COST ${p.cost}/${n}`);
      if (batch?.state.kind === "done" && p.complete < n) {
        warnings.push(`${id} is done in the plan but its sheet has open ticks (RED ${p.red}/${n})`);
      }
    } else {
      parts.push("no sheet");
    }
    const verdict = verdictText(code, id);
    parts.push(verdict.text);
    if (verdict.valid && batch?.state.kind === "open") warnings.push(`${id} is VALID but the plan still says open`);
    const running = runningText(code, id);
    if (running !== null) parts.push(running);
    lines.push(cut(parts.join(" — "), MAX_LINE_CHARS));
  }
  if (code.plan) {
    const planned = new Set(planBatches.map((b) => b.id));
    for (const f of [...code.sheets, ...code.verdicts]) {
      if (!planned.has(f.batch)) warnings.push(`${f.name} has no batch line in the plan`);
    }
  }
  return { ids, lines, warnings };
}

function codeLine(code: DevCode): string {
  const what = code.spec !== null ? `spec ${code.spec}` : code.change !== null ? `change ${code.change}` : "no spec";
  let plan = "no plan";
  if (code.plan) {
    const p = code.plan.plan;
    const done = p.batches.filter((b) => b.state.kind === "done").length;
    const feature = p.feature === undefined ? "" : ` "${p.feature}"`;
    plan = `plan ${code.plan.name}${feature} (${p.batches.length} batches, ${done} done)`;
  }
  return cut(`code: ${code.shown}/ — ${what} — ${plan}`, MAX_LINE_CHARS);
}

/** The lines of § 3.1; adds the consistency warnings to code.warnings. */
export function renderDevStatus(ctx: DevContext, code: DevCode): string[] {
  const batches = batchLines(code);
  for (const w of batches.warnings) if (!code.warnings.includes(w)) code.warnings.push(w);
  const warnings = [...ctx.warnings, ...code.warnings];
  const head = [...contextLines(ctx), codeLine(code)];

  const build = (maxBatches: number, maxWarnings: number): string[] => {
    const out = [...head, ...batches.lines.slice(0, maxBatches)];
    const hidden = batches.ids.slice(maxBatches);
    if (hidden.length > 0) out.push(`… ${hidden.length} more batches (${hidden[0]} to ${hidden[hidden.length - 1]})`);
    return [...out, ...warningLines(warnings, maxWarnings)];
  };
  const full = build(MAX_BATCH_LINES, MAX_WARNING_LINES);
  return full.join("\n").length <= TEXT_BUDGET ? full : build(SHRUNK_BATCH_LINES, SHRUNK_WARNING_LINES);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function codeEntry(c: CodeSummary): string {
  const what = [
    c.spec ? "spec" : "", c.change ? "change" : "", c.plan ? "plan" : "",
    c.sheets > 0 ? plural(c.sheets, "sheet") : "", c.verdicts > 0 ? plural(c.verdicts, "verdict") : "",
  ].filter((p) => p !== "");
  return cut(`${c.code} — ${what.join(", ")}`, MAX_CODE_ENTRY_CHARS);
}

/** The codes line of § 3.2: at most MAX_CODES_LISTED entries, fewer when the line would pass MAX_LINE_CHARS. */
function codesLine(codes: readonly CodeSummary[]): string {
  const entries = codes.slice(0, MAX_CODES_LISTED).map(codeEntry);
  const line = (k: number): string => {
    const shown = entries.slice(0, k);
    if (codes.length > k) shown.push(`… ${codes.length - k} more`);
    return `codes (${codes.length}): ${shown.join(" · ")}`;
  };
  let k = entries.length;
  while (k > 1 && line(k).length > MAX_LINE_CHARS) k--;
  return cut(line(k), MAX_LINE_CHARS);
}

/** The lines of § 3.2; `notProbed` counts the folders the probe cap left out. */
export function renderCodeList(ctx: DevContext, codes: readonly CodeSummary[], notProbed = 0): string[] {
  const lines = contextLines(ctx);
  if (codes.length === 0 && notProbed === 0) {
    lines.push(`no code under ${ctx.work.folder}/ (a code is a folder holding SPEC-, CHANGE- or *-PLAN.md files)`);
  } else {
    if (codes.length > 0) lines.push(codesLine(codes));
    if (notProbed > 0) lines.push(`… ${notProbed} more folders not probed`);
  }
  return [...lines, ...warningLines(ctx.warnings, MAX_WARNING_LINES)];
}

export async function runDevStatus(tokens: readonly string[], deps: DevStatusDeps): Promise<CommandView> {
  if (tokens.length > 1) return { text: DEV_STATUS_USAGE };
  const ctx = await loadDevContext(deps);
  const work = ctx.work;
  const code = tokens[0];
  if (code !== undefined && !isCode(code)) {
    return refusal(ctx,
      `dev-status: '${code}' is not a code: letters, digits, '.', '_' and '-', starting with a letter or a digit`);
  }
  const mainWorktree =
    `dev-status: the work folder ${work.folder} is in the main worktree, outside the mounts: run /dev-status from the main checkout`;
  if (work.outcome === "main-worktree") return refusal(ctx, mainWorktree);

  if (code === undefined) {
    let probe: { codes: CodeSummary[]; notProbed: number } = { codes: [], notProbed: 0 };
    if (work.exists) {
      try {
        probe = await probeDevCodes(deps, work);
      } catch (e) {
        return refusal(ctx, `dev-status: ${work.folder}/ cannot be listed (${messageOf(e).split("\n")[0]})`);
      }
    }
    return { lines: renderCodeList(ctx, probe.codes, probe.notProbed) };
  }

  const lookup = await loadDevCode(deps, work, code);
  if (lookup.found !== null) return { lines: renderDevStatus(ctx, lookup.found) };
  if (lookup.reason === "unreachable") return refusal(ctx, mainWorktree);
  if (lookup.reason === "empty") {
    return refusal(ctx, `dev-status: ${work.folder}/${code}/ holds no SPEC-, CHANGE- or *-PLAN.md file`);
  }
  const here = lookup.codes.length > 0 ? `codes here: ${lookup.codes.join(", ")}` : "no code here";
  return refusal(ctx, `dev-status: no folder ${work.folder}/${code}/ (${here})`);
}

// /dev-verify: the arguments only. The audit itself runs in crews/dev-verify (the gate,
// the capture, the build and the auditor can take minutes).
export const DEV_VERIFY_USAGE = "usage: /dev-verify F<n> [<code> | <path>/<CODE>-PLAN.md] [fast | full | resume] [--gate-only]";
export type DevVerifyMode = "fast" | "full" | "resume";
export interface DevVerifyArgs { batch: string; plan: string | null; mode: DevVerifyMode; gateOnly: boolean }

const DEV_VERIFY_MODES: readonly string[] = ["fast", "full", "resume"];

/** A plan named by its path: relative (or under /workspace/), ending -PLAN.md, with no ".." segment. */
function isPlanPath(token: string): boolean {
  const relative = token.startsWith("/workspace/") ? token.slice("/workspace/".length) : token;
  if (!relative.endsWith("-PLAN.md") || relative.startsWith("/")) return false;
  return !relative.split("/").includes("..");
}

/** The words fast, full and resume are modes: a code spelt so is named by its plan's path. */
export function parseDevVerifyArgs(tokens: readonly string[]): { ok: true; args: DevVerifyArgs } | { ok: false; text: string } {
  if (tokens.length === 0) return { ok: false, text: DEV_VERIFY_USAGE };
  const [batch, ...rest] = tokens;
  if (!/^F\d+$/.test(batch)) return { ok: false, text: `dev-verify: '${batch}' is not a batch: F<n>, e.g. F2` };
  let mode: DevVerifyMode | null = null;
  let plan: string | null = null;
  let gateOnly = false;
  for (const tok of rest) {
    if (DEV_VERIFY_MODES.includes(tok)) {
      if (mode !== null) return { ok: false, text: `dev-verify: one mode at most (fast, full or resume), not '${mode}' and '${tok}'` };
      mode = tok as DevVerifyMode;
    } else if (tok === "--gate-only") {
      gateOnly = true;
    } else if (tok.startsWith("--")) {
      return { ok: false, text: `dev-verify: unknown option '${tok}' (only --gate-only)` };
    } else if (isCode(tok) || isPlanPath(tok)) {
      if (plan !== null) return { ok: false, text: `dev-verify: one plan at most, not '${plan}' and '${tok}'` };
      plan = tok;
    } else {
      return { ok: false, text: `dev-verify: '${tok}' is neither a code nor a <CODE>-PLAN.md path` };
    }
  }
  return { ok: true, args: { batch, plan, mode: mode ?? "fast", gateOnly } };
}

// /dev-learn: the arguments, and the two decisions (--accept, --refuse). Proposing and
// listing read every verdict file, so they run in crews/dev-learn; a decision is a few
// reads and one or two writes, answered by the command itself. Nothing here edits the
// file a proposal names: --accept prints the change to make.
export const DEV_LEARN_USAGE = "usage: /dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>";
export type DevLearnArgs =
  | { kind: "propose"; axis: string | null }
  | { kind: "list"; axis: string | null }
  | { kind: "accept"; ids: string[] }
  | { kind: "refuse"; target: string };
export type DevLearnDecisionDeps = DevContextDeps & { files: Pick<Files, "read" | "list" | "write">; clock: () => Date };

const PROPOSAL_ID = /^[0-9a-f]{8}([0-9a-f]{2})?$/;
const MAX_AXIS_CHARS = 40;
const MAX_REFUSED_CHARS = 200;
const PROPOSALS_LOOKED_UP = 10;
const LEARN_LIST_CAP = 1000;
const ALONE = "dev-learn: --accept and --refuse each come alone";
const GIT_REMOTE_ORIGIN = "git remote get-url origin";

type DevLearnParse = { ok: true; args: DevLearnArgs } | { ok: false; text: string };

function parseAcceptIds(rest: readonly string[]): DevLearnParse {
  const ids: string[] = [];
  for (const tok of rest) {
    if (tok === "--refuse" || tok === "--accept" || tok === "--list") return { ok: false, text: ALONE };
    for (const piece of tok.split(",")) {
      if (piece === "") continue;
      const id = piece.toLowerCase();
      if (!PROPOSAL_ID.test(id)) {
        return { ok: false, text: `dev-learn: '${piece}' is not a proposal id (8 or 10 hex digits, from PROPOSALS.md)` };
      }
      ids.push(id);
    }
  }
  if (ids.length === 0) return { ok: false, text: "dev-learn: --accept needs at least one proposal id, e.g. --accept 3f2a9c1e" };
  return { ok: true, args: { kind: "accept", ids } };
}

function parseRefuseTarget(rest: readonly string[]): DevLearnParse {
  if (rest.includes("--accept") || rest.includes("--refuse") || rest.includes("--list")) return { ok: false, text: ALONE };
  const joined = rest.join(" ").trim();
  // An id is read as one whatever its case, as --accept reads it; the motif's words keep theirs.
  const target = PROPOSAL_ID.test(joined.toLowerCase()) ? joined.toLowerCase() : joined;
  if (target === "") return { ok: false, text: "dev-learn: --refuse needs a proposal id or the motif's words" };
  if (Array.from(target).length > MAX_REFUSED_CHARS) return { ok: false, text: "dev-learn: a refused motif is at most 200 characters" };
  return { ok: true, args: { kind: "refuse", target } };
}

/** `--accept` and `--refuse` take the rest of the line; `--list` is a flag; one other word is the axis. */
export function parseDevLearnArgs(tokens: readonly string[]): DevLearnParse {
  let axis: string | null = null;
  let list = false;
  for (const [i, tok] of tokens.entries()) {
    if (tok === "--accept" || tok === "--refuse") {
      if (axis !== null || list) return { ok: false, text: ALONE };
      const rest = tokens.slice(i + 1);
      return tok === "--accept" ? parseAcceptIds(rest) : parseRefuseTarget(rest);
    }
    if (tok === "--list") {
      list = true;
    } else if (tok.startsWith("--")) {
      return { ok: false, text: `dev-learn: unknown option '${tok}' (--list, --accept, --refuse)` };
    } else if (axis !== null) {
      return { ok: false, text: `dev-learn: one axis at most, not '${axis}' and '${tok}'` };
    } else if (tok.includes("|") || /[\r\n]/.test(tok) || Array.from(tok).length > MAX_AXIS_CHARS) {
      return { ok: false, text: `dev-learn: '${tok}' is not an axis` };
    } else {
      axis = tok;
    }
  }
  return { ok: true, args: list ? { kind: "list", axis } : { kind: "propose", axis } };
}

const isNotFound = (e: unknown): boolean => /not found/i.test(messageOf(e));
const firstLineOf = (e: unknown): string => messageOf(e).split("\n")[0];

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
interface ProposalsLookup { files: Array<{ folder: string; file: ProposalsFile }>; warnings: string[] }

/** The proposals.json of the 10 newest learn-<date>/ folders, newest first; a bad one is a warning. */
async function readProposals(files: Pick<Files, "read" | "list">, work: WorkFolder, vfsPath: string): Promise<ProposalsLookup> {
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
    text = await readOrNull(files, `${WORKSPACE_ROOT}/${LEARN_STATE_FILE}`);
  } catch (e) {
    return { ok: false, text: `dev-learn: ${LEARN_STATE_FILE} cannot be read (${firstLineOf(e)}): fix or delete it; nothing was written` };
  }
  const read = parseLearnState(text);
  return read.ok ? { ok: true, state: read.state } : { ok: false, text: `dev-learn: ${read.problem}: fix or delete it; nothing was written` };
}

/** Writes the state; the BLOCKED text when the write throws, null when it went through. */
async function saveLearnState(files: Pick<Files, "write">, state: LearnState): Promise<string | null> {
  try {
    await files.write(`${WORKSPACE_ROOT}/${LEARN_STATE_FILE}`, serializeLearnState(state));
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
  const path = `${WORKSPACE_ROOT}/${REFUSED_FILE}`;
  let previous: string | null;
  try {
    previous = await readOrNull(deps.files, path);
  } catch (e) {
    return { ok: false, line: `dev-learn: ${REFUSED_FILE} cannot be read (${firstLineOf(e)}): nothing was written` };
  }
  const already = previous === null ? undefined : parseRefused(previous).motifs.find((m) => m.topic === topic);
  if (already !== undefined) return { ok: true, line: `${topic} was already refused on ${already.date}` };
  const project = await projectName(deps.shell);
  try {
    await deps.files.write(path, appendRefused(previous, { topic, project, date, motif: motifText }));
  } catch (e) {
    return { ok: false, line: `dev-learn: BLOCKED — ${REFUSED_FILE} cannot be written (${firstLineOf(e)})` };
  }
  return { ok: true, line: `refused: ${topic} — left out of future proposals (${REFUSED_FILE})` };
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
  args: Extract<DevLearnArgs, { kind: "accept" | "refuse" }>,
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

// /dev-plan: the arguments, and the Blocking gate. The gate is a bounded read (the context,
// the listings of the work folder, one source file), so it answers in the handler and no
// crew starts for a source that cannot be planned yet; the inventory, the model call, the
// files and the review run in crews/dev-plan, which runs the same gate again.
export const DEV_PLAN_USAGE = "usage: /dev-plan [<code> | <path>/SPEC-<code>.md | <path>/CHANGE-<code>.md] [--replace]";
export interface DevPlanArgs { source: string | null; replace: boolean }
export type DevPlanGateDeps = DevContextDeps;

/** A spec or change brief named by its path: ends .md, with no ".." segment (plan-source checks the name). */
function isSourcePath(token: string): boolean {
  return token.endsWith(".md") && !token.split("/").includes("..");
}

/** At most one source (a code or a .md path) and the flag --replace, in any order. */
export function parseDevPlanArgs(tokens: readonly string[]): { ok: true; args: DevPlanArgs } | { ok: false; text: string } {
  let source: string | null = null;
  let replace = false;
  for (const tok of tokens) {
    if (tok === "--replace") {
      if (replace) return { ok: false, text: "dev-plan: --replace once at most" };
      replace = true;
    } else if (tok.startsWith("--")) {
      return { ok: false, text: `dev-plan: unknown option '${tok}' (only --replace)` };
    } else if (isCode(tok) || isSourcePath(tok)) {
      if (source !== null) return { ok: false, text: `dev-plan: one source at most, not '${source}' and '${tok}'` };
      source = tok;
    } else {
      return { ok: false, text: `dev-plan: '${tok}' is neither a code nor a SPEC-<code>.md / CHANGE-<code>.md path` };
    }
  }
  return { ok: true, args: { source, replace } };
}

/** The Blocking gate, in the handler: null to launch the crew, else the message to print. */
export async function devPlanGate(args: DevPlanArgs, deps: DevPlanGateDeps): Promise<string | null> {
  try {
    const ctx = await loadDevContext(deps);
    const resolution = await resolvePlanSource(deps.files, ctx.work, args.source);
    if (!resolution.ok) return resolution.text;
    const source = resolution.source;
    const read = await readPlanSource(deps.files, source);
    if (!read.ok) return read.text;
    const rows = read.parsed.blocking;
    return rows.length === 0 ? null : blockingStop(source.sourceShown, source.kind, source.code, rows);
  } catch {
    // The crew runs the same checks and reports what went wrong; the handler never fails on its own gate.
    return null;
  }
}
