// /dev-batches: its arguments, its three shapes, and what its `completed` does with each answer of a chain.
//   /dev-batches [<code>] [--pr] [--concurrency n]   the run of a plan (the dev-batches crew);
//   /dev-batches <code> F<n> [--close [--pr]] [— correction: <finding>]   one batch (the dev-implement crew), its
//     audit then its close chained as the batch's own chain (dev-implement.ts chainStep);
//   /dev-batches <code> F<n> --audit [fast|full|resume] [--gate-only]   the audit of one batch (the dev-verify crew).
// The aliases /dev-implement and /dev-verify keep their own lines: typed so, a line is read as the batch or the audit.
// The answers of a run are told apart by the crew that answered (`result.intent`, the crew's name:
// ScriptHostFacade.runCrewAsync); a run and one batch get answers from the same crews, so the dispatch records the
// chain it launched in the session (DEV_BATCHES_CHAIN_STATE_KEY) and `completed` reads it (devBatchesCompleted). The
// dev-batches crew answers JSON `{ lines, next? }`: its `next` (one batch) is launched. The batch and its audit answer
// as in the batch's own chain: the audit, then on VALID the close, which commits the batch and is sent `push: false`
// (the run pushes at its own close; the dev-implement crew keeps it, run-dev-implement.ts implementInputs). An answer
// of theirs that launches nothing (the batch committed, a stop, a GAPS verdict) launches the dev-batches crew again
// with the answer's last lines: it logs what came of the batch and names the next one. With `--concurrency n` (2 to 4)
// the crew runs a wave of batches itself, each under its own worktree, and answers `next: dev-batches` for the
// next wave: launched as it is, one hop per wave. Every hop of a run is launched with `{ chain: "continue" }` (Orkeon
// #221): the new instance keeps the depth of the one whose `completed` runs, so a plan of any length closes in one
// `/dev-batches` where `Orkeon:Cli:ScriptCommands:MaxChainDepth` (8) stopped it after about two batches. Before a
// hop that writes (a batch, its close, the crew again) the session's context is read again (Orkeon #220): a mode
// that no longer allows it refuses the hop, else the fresh mode and rules ride in the launch input. The answers are
// pure functions (batchesChainStep); batchesNextLaunch and launchBatchesHop orchestrate the ports of the `completed`.
import type { CrewLaunchOptions, SessionStore } from "../../../shared/application/ports.ts";
import { DEV_BATCHES_CHAIN_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";
import { checkConcurrency, concurrencyModeRefusal } from "../../../shared/domain/dev/batches-concurrency.ts";
import { correctionCommand } from "../../../shared/domain/dev/verdict-format.ts";
import { workspaceRelative } from "../../../shared/domain/vfs.ts";
import { launchCrew } from "../dispatch.ts";
import type { CrewCompletion, LaunchDeps } from "../dispatch.ts";
import { chainStep, freshContext, launchChained, nextLaunch, withContext, CONTEXT_NOT_READ_LINE } from "./dev-implement.ts";
import type { ChainHopDeps, ChainLaunch, DevImplementArgs, DevImplementDispatchDeps } from "./dev-implement.ts";
import { devVerifyStep, markActiveWorkflow, startDevStep, writeModeRefusal } from "../dev-step.ts";
import { storedEffort } from "../effort.ts";

export const DEV_BATCHES_USAGE =
  "usage: /dev-batches [<code>] [--pr] [--concurrency n] | <code> F<n> [--close [--pr]] [— correction: <finding>]" +
  " | <code> F<n> --audit [fast | full | resume] [--gate-only]" +
  "   (no code: the run in progress goes on; n from 1 to 4, above 1 in bypassPermissions; with F<n>, <code> may be a <path>/<CODE>-PLAN.md)";
/** `concurrency` only when the option is typed: without it the run goes on as the plan's run in progress was (one at a
 *  time when none is); `--concurrency 1` goes back to one at a time. */
export interface DevBatchesArgs { code: string | null; pr: boolean; concurrency?: number }
export type DevVerifyMode = "fast" | "full" | "resume";
/** The audit of one batch: its plan (a code or a `<path>/<CODE>-PLAN.md`, null to find it), its mode, the gate alone. */
export interface DevVerifyArgs { batch: string; plan: string | null; mode: DevVerifyMode; gateOnly: boolean }
/** The shape a line reads to: the run of a plan, one batch, or the audit of one batch. */
export type DevBatchesParse =
  | { ok: true; route: "run"; args: DevBatchesArgs }
  | { ok: true; route: "batch"; args: DevImplementArgs }
  | { ok: true; route: "audit"; args: DevVerifyArgs }
  | { ok: false; text: string };

/** The aliases that keep their own lines: one batch, and the audit of one batch. */
export const DEV_IMPLEMENT_ALIAS = "dev-implement";
export const DEV_VERIFY_ALIAS = "dev-verify";

const BATCH = /^F\d+$/;
const AUDIT_MODES: readonly string[] = ["fast", "full", "resume"];
const CORRECTION_WORD = /^correction:?(.*)$/i;
/** The options that name a batch: refused on the run of a plan. */
const BATCH_OPTIONS: readonly string[] = ["--close", "--audit", "--gate-only"];
const isConcurrency = (tok: string): boolean => tok === "--concurrency" || tok.startsWith("--concurrency=");
type Refusal = { ok: false; text: string };
const refuse = (text: string): Refusal => ({ ok: false, text: `dev-batches: ${text}` });

/** Splits `… — correction: <finding>` off the tokens: the ones before, and the finding (null without one). */
function splitCorrection(tokens: readonly string[]): { before: string[]; finding: string | null } {
  for (let i = 0; i < tokens.length; i++) {
    const dash = tokens[i] === "—" || tokens[i] === "--";
    const at = dash ? i + 1 : i;
    const word = tokens[at] ?? "";
    // Without the dash the word needs its colon: `correction` alone may be a plan's code.
    const m = dash || /^correction:/i.test(word) ? CORRECTION_WORD.exec(word) : null;
    if (m === null) {
      if (dash) return { before: [...tokens], finding: null };
      continue;
    }
    const finding = [m[1], ...tokens.slice(at + 1)].join(" ").replace(/\s+/g, " ").trim();
    return { before: tokens.slice(0, i), finding };
  }
  return { before: [...tokens], finding: null };
}

/** A plan named by its path: relative (or under /workspace/ for an audit), ending -PLAN.md, with no ".." segment. */
function isPlanPath(token: string, underWorkspace: boolean): boolean {
  const relative = underWorkspace ? workspaceRelative(token) : token.replace(/\\/g, "/");
  if (!relative.endsWith("-PLAN.md") || relative.startsWith("/")) return false;
  return !relative.split("/").includes("..");
}

/** The run of a plan; `--concurrency <n>` (or `=<n>`) is checked: 1 to 4. */
function parseRun(tokens: readonly string[]): DevBatchesParse {
  let code: string | null = null;
  let pr = false;
  let concurrency: number | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (isConcurrency(tok)) {
      const value = tok === "--concurrency" ? tokens[++i] : tok.slice("--concurrency=".length);
      if (value === undefined) return refuse("--concurrency needs a number");
      const c = checkConcurrency(value);
      if (!c.ok) return refuse(c.line);
      concurrency = c.value;
      continue;
    }
    if (tok === "--pr") pr = true;
    else if (BATCH_OPTIONS.includes(tok)) return refuse(`${tok} names its batch: /dev-batches <code> F<n> ${tok}`);
    else if (tok.startsWith("-")) return refuse(`unknown option '${tok}' (--pr, --concurrency; with F<n>: --close, --audit)`);
    else if (!isCode(tok)) return refuse(`'${tok}' is not a work code (a folder name of the work folder)`);
    else if (code !== null) return refuse(`one code at most, not '${code}' and '${tok}'`);
    else code = tok;
  }
  const args = concurrency !== undefined ? { code, pr, concurrency } : { code, pr };
  return { ok: true, route: "run", args };
}

/** One batch: its plan, the close (`--pr` only with it), or a correction (never with the close). */
function parseBatch(batch: string, rest: readonly string[], finding: string | null): DevBatchesParse {
  if (finding !== null && finding === "") {
    return refuse(`a correction names its finding: ${correctionCommand("<code>", batch, "<the audit's gap>")}`);
  }
  let plan: string | null = null;
  let close = false;
  let pr = false;
  for (const tok of rest) {
    if (tok === "--close") close = true;
    else if (tok === "--pr") pr = true;
    else if (AUDIT_MODES.includes(tok) || tok === "--gate-only") return refuse(`'${tok}' goes with --audit: /dev-batches <code> ${batch} --audit ${tok}`);
    else if (tok.startsWith("-")) return refuse(`unknown option '${tok}' with ${batch} (--close, --pr, --audit)`);
    else if (isCode(tok) || isPlanPath(tok, false)) {
      if (plan !== null) return refuse(`one plan at most, not '${plan}' and '${tok}'`);
      plan = tok;
    } else return refuse(`'${tok}' is neither a code nor a <CODE>-PLAN.md path`);
  }
  if (pr && !close) return refuse(`with ${batch}, --pr goes with --close (the pull request is opened at the close)`);
  if (close && finding !== null) return refuse("a correction runs the batch, --close commits it: one at a time");
  return { ok: true, route: "batch", args: { batch, plan, close, pr, correction: finding } };
}

/** The audit of one batch: one mode at most (fast by default), the gate alone with --gate-only. The words fast, full
 *  and resume are modes: a code spelt so is named by its plan's path. */
function parseAudit(batch: string, rest: readonly string[]): DevBatchesParse {
  let mode: DevVerifyMode | null = null;
  let plan: string | null = null;
  let gateOnly = false;
  for (const tok of rest) {
    if (AUDIT_MODES.includes(tok)) {
      if (mode !== null) return refuse(`one audit mode at most (fast, full or resume), not '${mode}' and '${tok}'`);
      mode = tok as DevVerifyMode;
    } else if (tok === "--gate-only") {
      gateOnly = true;
    } else if (tok.startsWith("-")) {
      return refuse(`unknown option '${tok}' with --audit (only --gate-only)`);
    } else if (isCode(tok) || isPlanPath(tok, true)) {
      if (plan !== null) return refuse(`one plan at most, not '${plan}' and '${tok}'`);
      plan = tok;
    } else {
      return refuse(`'${tok}' is neither a code nor a <CODE>-PLAN.md path`);
    }
  }
  return { ok: true, route: "audit", args: { batch, plan, mode: mode ?? "fast", gateOnly } };
}

/**
 * The line after /dev-batches, read to its shape: no `F<n>`, the run of a plan; `F<n>`, one batch; `F<n> --audit`,
 * its audit. `typed` is the name the person typed: /dev-implement names a batch, /dev-verify an audit.
 */
export function parseDevBatchesArgs(tokens: readonly string[], typed = "dev-batches"): DevBatchesParse {
  const { before, finding } = splitCorrection(tokens);
  if (before.includes("--help") || before.includes("-h")) return { ok: false, text: DEV_BATCHES_USAGE };
  const at = before.findIndex((t) => BATCH.test(t));
  const audit = typed === DEV_VERIFY_ALIAS || before.includes("--audit");
  if (at < 0) {
    if (typed === DEV_IMPLEMENT_ALIAS || typed === DEV_VERIFY_ALIAS) {
      return tokens.length === 0 ? { ok: false, text: DEV_BATCHES_USAGE } : refuse(`/${typed} names its batch first: F<n>, e.g. F2`);
    }
    if (finding !== null) return refuse(`a correction names its batch: ${correctionCommand("<code>", "F<n>", "<finding>")}`);
    return parseRun(before);
  }
  const batch = before[at];
  const rest = [...before.slice(0, at), ...before.slice(at + 1)];
  const other = rest.find((t) => BATCH.test(t));
  if (other !== undefined) return refuse(`one batch at most, not ${batch} and ${other}`);
  if (rest.some(isConcurrency)) return refuse(`--concurrency runs a plan's batches: it does not go with ${batch}`);
  if (!audit) return parseBatch(batch, rest, finding);
  if (finding !== null) return refuse("--audit judges the batch, a correction runs it: one at a time");
  return parseAudit(batch, rest.filter((t) => t !== "--audit"));
}

/** What the command launches the crew with: the arguments, then what its dispatch read; `concurrency` when typed. */
export function batchesLaunchInput(args: DevBatchesArgs, read: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(args.code === null ? {} : { code: args.code }), pr: args.pr, ...read,
    ...(args.concurrency === undefined ? {} : { concurrency: args.concurrency }),
  };
}

/** Above 1, the refusal of a session mode that asks before shell commands, before anything is launched. */
export function batchesModeRefusal(args: DevBatchesArgs, mode: string): string | null {
  const line = concurrencyModeRefusal(args.concurrency ?? 1, mode);
  return line === null ? null : `dev-batches: ${line}`;
}

/** The lines of an answer handed back to the dev-batches crew. */
export const AFTER_LINES = 20;
const DEV_BATCHES_AGAIN = "/dev-batches";

/** What a refused hop of a parallel run is typed again as: the same concurrency, the record naming the plan. */
const parallelAgain = (input: Record<string, unknown>): string =>
  typeof input.concurrency === "number" && input.concurrency > 1 ? `${DEV_BATCHES_AGAIN} --concurrency ${input.concurrency}` : DEV_BATCHES_AGAIN;

export interface BatchesChainStep { lines: string[]; launch?: ChainLaunch }

function batchesAnswer(payload: string): BatchesChainStep {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return { lines: payload.split("\n") };
  }
  const a = parsed as { lines?: unknown; next?: { crew?: unknown; input?: Record<string, unknown> } } | null;
  if (a === null || typeof a !== "object" || !Array.isArray(a.lines)) return { lines: payload.split("\n") };
  const lines = a.lines.map(String);
  // The next wave of a parallel run: the crew again, with the input it gave.
  if (a.next?.crew === "dev-batches" && a.next.input !== undefined) {
    return { lines, launch: { crew: "dev-batches", input: { ...a.next.input }, instead: parallelAgain(a.next.input) } };
  }
  if (a.next?.crew !== "dev-implement" || a.next.input === undefined) return { lines };
  const { batch, plan } = a.next.input;
  return { lines, launch: { crew: "dev-implement", input: { ...a.next.input }, instead: `/dev-batches ${plan} ${batch}` } };
}

/** What `completed` prints and launches for one answer, by the crew that gave it. */
export function batchesChainStep(intent: string, payload: string): BatchesChainStep {
  if (intent === "dev-batches") return batchesAnswer(payload);
  if (intent !== "dev-implement" && intent !== "dev-verify") return { lines: payload.split("\n") };
  const step = chainStep(payload);
  if (step.launch !== undefined) {
    const close = step.launch.crew === "dev-implement" && step.launch.input.close === true;
    // A batch's close never pushes nor opens a pull request: the run's close does both.
    return close ? { lines: step.lines, launch: { ...step.launch, input: { ...step.launch.input, push: false, githubTool: false } } } : step;
  }
  const after = step.lines.filter((l) => l.trim() !== "").slice(-AFTER_LINES);
  return { lines: step.lines, launch: { crew: "dev-batches", input: { after }, instead: DEV_BATCHES_AGAIN } };
}

/** Every hop of the run keeps the depth of the instance whose `completed` launches it (Orkeon #221). */
export const BATCHES_CHAIN: CrewLaunchOptions = { chain: "continue" };

const BATCHES_WRITES = { step: "dev-batches", what: "writes files, commits and pushes" };
const CHAIN_FAILED_THEN = "then type /dev-batches: the run goes on from the first batch not done";

/**
 * What `completed` prints and launches for one answer of the run, the gate put back and, before a hop that writes
 * (every hop but the audit), the session's context read again: a read-only mode, or a mode that asks before a
 * parallel wave, refuses the hop with the command to type; else the launch carries the fresh mode and rules, and
 * the crews read them rather than the run record's. A context that cannot be read leaves the record's in force.
 */
export async function batchesNextLaunch(result: CrewCompletion, deps: ChainHopDeps): Promise<BatchesChainStep> {
  if (!result.success) {
    return { lines: [`✗ the dev-batches chain failed (${result.intent || "a crew"}): ${result.error ?? "unknown"}`, CHAIN_FAILED_THEN] };
  }
  const step = batchesChainStep(String(result.intent ?? ""), String(result.payload ?? ""));
  if (step.launch === undefined) return step;
  const refusal = deps.reapply(step.launch.crew === "dev-verify" ? "dev-verify" : "dev-implement");
  if (refusal !== null) return { lines: [...step.lines, `✗ ${refusal}`, `then type ${step.launch.instead}`] };
  if (step.launch.crew === "dev-verify") return step;
  const context = await freshContext(deps.context);
  if (context === null) return { lines: [...step.lines, CONTEXT_NOT_READ_LINE], launch: step.launch };
  const concurrency = step.launch.crew === "dev-batches" && typeof step.launch.input.concurrency === "number" ? step.launch.input.concurrency : 1;
  const line = writeModeRefusal(context.permissionMode, BATCHES_WRITES.step, BATCHES_WRITES.what)
    ?? batchesModeRefusal({ code: null, pr: false, concurrency }, context.permissionMode);
  if (line !== null) return { lines: [...step.lines, line.startsWith("✗") ? line : `✗ ${line}`, `then type ${step.launch.instead}`] };
  return { lines: step.lines, launch: { ...step.launch, input: withContext(step.launch.input, context) } };
}

/** Launches a hop of the run with the parent's depth kept (BATCHES_CHAIN): the lines a refusal or a failure leaves. */
export function launchBatchesHop(launch: ChainLaunch, deps: LaunchDeps): string[] {
  return launchChained(launch, (crew, input, options) => launchCrew(deps, crew, input, {}, options), BATCHES_CHAIN);
}

/** The line `completed` prints when a hop's own reading fails (the context read threw past the handler). */
export function batchesHopFailedLine(error: unknown): string {
  return `✗ the dev-batches chain stopped (${String((error as Error)?.message ?? error).split("\n")[0]}): ${CHAIN_FAILED_THEN}`;
}

/** The chain a dispatch launched, kept in the session for `completed`: the run of a plan, one batch, one audit. */
export type BatchesChain = "run" | "batch" | "audit";
const CHAINS: readonly string[] = ["run", "batch", "audit"];

/**
 * Records the chain about to be launched. A run is what an unrecorded chain is read as, so its failure costs
 * nothing; a batch or an audit read as a run would chain the wrong hops, so its failure is the refusal returned.
 */
export async function recordChain(session: Pick<SessionStore, "writeState">, chain: BatchesChain): Promise<string | null> {
  try {
    await session.writeState(DEV_BATCHES_CHAIN_STATE_KEY, chain);
    return null;
  } catch (error) {
    if (chain === "run") return null;
    const reason = String((error as Error)?.message ?? error).split("\n")[0];
    return `dev-batches: the session could not keep which chain runs (${reason}): nothing was launched`;
  }
}

/** The chain an answer belongs to: the dev-batches crew answers only a run; another crew's answer, the recorded one
 *  (a run when none was recorded or the session cannot be read). */
export async function readChain(session: Pick<SessionStore, "readState">, intent: string): Promise<BatchesChain> {
  if (intent === "dev-batches") return "run";
  try {
    const value = await session.readState(DEV_BATCHES_CHAIN_STATE_KEY);
    return value !== null && CHAINS.includes(value) ? (value as BatchesChain) : "run";
  } catch {
    return "run";
  }
}

export interface BatchesCompletedDeps extends ChainHopDeps { session: Pick<SessionStore, "readState"> }
export interface BatchesCompletion { chain: BatchesChain; lines: string[]; launch?: ChainLaunch }

/**
 * What `completed` prints and launches for one answer, by its chain: a run's hop (batchesNextLaunch), one batch's
 * audit or close (nextLaunch, the chain of a typed batch), or an audit's verdict printed, nothing launched.
 */
export async function devBatchesCompleted(result: CrewCompletion, deps: BatchesCompletedDeps): Promise<BatchesCompletion> {
  const chain = await readChain(deps.session, String(result.intent ?? ""));
  if (chain === "audit") {
    if (result.success && result.streamed === true) return { chain, lines: [] };
    return { chain, lines: [result.success ? String(result.payload ?? "") : `✗ the audit failed: ${result.error ?? "unknown"}`] };
  }
  const step = chain === "batch" ? await nextLaunch(result, deps) : await batchesNextLaunch(result, deps);
  return { chain, ...step };
}

/** Launches the hop of a completion: a run's keeps its parent's depth (BATCHES_CHAIN), one batch's climbs (at most
 *  three hops from a typed command). The lines a refusal or a failure leaves. */
export function launchCompletedHop(completion: BatchesCompletion, deps: LaunchDeps): string[] {
  if (completion.launch === undefined) return [];
  if (completion.chain !== "batch") return launchBatchesHop(completion.launch, deps);
  return launchChained(completion.launch, (crew, input) => launchCrew(deps, crew, input));
}

export type DevVerifyDispatchDeps = Omit<DevImplementDispatchDeps, "files" | "shell">;
export type DevVerifyDispatch = { refused: string } | { input: Record<string, unknown>; details: Record<string, unknown> };

/** One audit's dispatch, from its parsed arguments: unless --gate-only (no model, no gate), the step's rules put in
 *  the gate; the batch recorded as the one in progress; the crew's input. */
export async function runDevVerifyDispatch(args: DevVerifyArgs, deps: DevVerifyDispatchDeps): Promise<DevVerifyDispatch> {
  const step = devVerifyStep(args);
  let details: Record<string, unknown> = {};
  let crewInput: Record<string, unknown> = { hooks: [] };
  if (step !== null) {
    const start = await startDevStep(step, { session: deps.session, config: deps.config, gate: deps.gate(), catalogue: deps.catalogue() });
    if (!start.ok) {
      deps.write(start.line);
      return { refused: start.line };
    }
    for (const line of start.lines) deps.write(line);
    details = { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length };
    crewInput = start.input;
  }
  const unrecorded = await markActiveWorkflow(deps.session, args);
  if (unrecorded !== null) deps.write(unrecorded);
  return { input: { ...args, ...crewInput, effort: await storedEffort(deps.session) }, details };
}
