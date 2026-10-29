// /dev-status: where a piece of dev work stands, read from the files the dev workflow
// leaves in the work folder (the global plan, the batch sheets, the verdicts and the
// batches log). Read-only. The use case takes its ports and returns a CommandView;
// dev-status.cmd.ts wires the real ports and shows it.
import type { CommandView } from "../view.ts";
import type { CodeSummary, DevCode, DevContext, DevContextDeps } from "../../../shared/application/dev/load-dev-context.ts";
import { loadDevCode, loadDevContext, probeDevCodes } from "../../../shared/application/dev/load-dev-context.ts";
import { workFolderLabel } from "../../../shared/application/dev/resolve-work-folder.ts";
import { PROPOSAL_ID, runDevLearnDecision } from "../../../shared/application/dev/learn-decision.ts";
export { runDevLearnDecision };
export type { DevLearnDecisionDeps } from "../../../shared/application/dev/learn-decision.ts";
import { compareBatchIds, isCode } from "../../../shared/domain/dev/artefacts.ts";
import { sheetProgress } from "../../../shared/domain/dev/plan-format.ts";
import type { BatchState, PlanBatch } from "../../../shared/domain/dev/plan-format.ts";
import { lastVerdict, severityCounts } from "../../../shared/domain/dev/verdict-format.ts";
import { readPlanSource, resolvePlanSource } from "../../../shared/application/dev/plan-source.ts";
import { blockingStop } from "../../../shared/domain/dev/spec-format.ts";

export type DevStatusDeps = DevContextDeps;
export const DEV_STATUS_USAGE = "usage: /dev-status [<code>]";
const MAX_BATCH_LINES = 20;
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
function renderDevStatus(ctx: DevContext, code: DevCode): string[] {
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
function renderCodeList(ctx: DevContext, codes: readonly CodeSummary[], notProbed = 0): string[] {
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

// /dev-learn: the arguments, and the two decisions (--accept, --refuse). Proposing and
// listing read every verdict file, so they run in crews/dev-learn; a decision is a few
// reads and one or two writes, answered by the command itself through
// shared/application/dev/learn-decision.ts (re-exported here). Nothing there edits the
// file a proposal names: --accept prints the change to make.
export const DEV_LEARN_USAGE = "usage: /dev-learn [<axis>] [--list] | --accept <id>[,<id>…] | --refuse <id | motif text>";
export type DevLearnArgs =
  | { kind: "propose"; axis: string | null }
  | { kind: "list"; axis: string | null }
  | { kind: "accept"; ids: string[] }
  | { kind: "refuse"; target: string };

const MAX_AXIS_CHARS = 40;
const MAX_REFUSED_CHARS = 200;
const ALONE = "dev-learn: --accept and --refuse each come alone";

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
