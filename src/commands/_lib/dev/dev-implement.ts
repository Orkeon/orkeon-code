// /dev-implement: its arguments, and what its `completed` does with each answer of the chain. The
// crew answers JSON `{ lines, next? }`: the lines are printed and `next` (the audit, its input as the
// crew wrote it: mode, hooks, effort) is launched.
// /dev-verify, launched from here, drains to the same `completed` as plain text: printed, and on
// its VALID line the close is launched (`/dev-implement F<n> <plan> --close`). A launch that
// cannot run prints the command for the user instead. Before a hop that writes (the close), the session's
// context is read again (Orkeon #220, `completed` awaited by the host): a mode that no longer allows it refuses
// the hop with the command to type, else the fresh mode, rules and github tool ride in the launch input, so the
// crew reads them rather than the context its record kept at the launch; a context that cannot be read leaves
// the record's in force, said in a line. The dispatch (runDevImplementDispatch) checks the mode,
// starts the step and sizes the run to the sheet's open steps over the ports it is handed; the chain's launch is
// handed to it too.
import type { CrewLaunchOptions, Files, PermissionRules, Shell, ToolCatalogue } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { isCode } from "../../../shared/domain/dev/artefacts.ts";
import type { DevStep } from "../../../shared/domain/dev/step-rules.ts";
import { countOpenSteps } from "../../../crews/dev-implement/application/count-open-steps.ts";
import { markActiveWorkflow, startDevStep, writeModeRefusal } from "../dev-step.ts";
import type { CrewCompletion, LaunchResult } from "../dispatch.ts";
import { storedEffort } from "../effort.ts";
import { readPullRequestContext } from "../pr-context.ts";
import type { PullRequestContext } from "../pr-context.ts";

export const DEV_IMPLEMENT_USAGE =
  "usage: /dev-implement F<n> [<code> | <path>/<CODE>-PLAN.md] [--close] [--pr] | F<n> [<code> | <plan>] — correction: <finding>";
export interface DevImplementArgs { batch: string; plan: string | null; close: boolean; pr: boolean; correction: string | null }

const CORRECTION_WORD = /^correction:?(.*)$/i;

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

function isPlanPath(token: string): boolean {
  const relative = token.replace(/\\/g, "/");
  if (!relative.endsWith("-PLAN.md") || relative.startsWith("/")) return false;
  return !relative.split("/").includes("..");
}

export function parseDevImplementArgs(tokens: readonly string[]): { ok: true; args: DevImplementArgs } | { ok: false; text: string } {
  if (tokens.length === 0) return { ok: false, text: DEV_IMPLEMENT_USAGE };
  const [batch, ...all] = tokens;
  if (!/^F\d+$/.test(batch)) return { ok: false, text: `dev-implement: '${batch}' is not a batch: F<n>, e.g. F2` };
  const { before: rest, finding } = splitCorrection(all);
  if (finding !== null && finding === "") {
    return { ok: false, text: `dev-implement: a correction names its finding: /dev-implement ${batch} — correction: <the audit's gap>` };
  }
  let plan: string | null = null;
  let close = false;
  let pr = false;
  for (const tok of rest) {
    if (tok === "--close") close = true;
    else if (tok === "--pr") pr = true;
    else if (tok.startsWith("--")) return { ok: false, text: `dev-implement: unknown option '${tok}' (--close, --pr)` };
    else if (isCode(tok) || isPlanPath(tok)) {
      if (plan !== null) return { ok: false, text: `dev-implement: one plan at most, not '${plan}' and '${tok}'` };
      plan = tok;
    } else return { ok: false, text: `dev-implement: '${tok}' is neither a code nor a <CODE>-PLAN.md path` };
  }
  if (pr && !close) return { ok: false, text: "dev-implement: --pr goes with --close (the pull request is opened at the close)" };
  if (close && finding !== null) return { ok: false, text: "dev-implement: a correction runs the batch, --close commits it: one at a time" };
  return { ok: true, args: { batch, plan, close, pr, correction: finding } };
}

export interface ChainLaunch { crew: string; input: Record<string, unknown>; instead: string }
export interface ChainStep { lines: string[]; launch?: ChainLaunch }

const VALID_LINE = /^→ Batch (F\d+) VALID\./m;
const WRITTEN_LINE = /^written: (\S+)\/([A-Za-z0-9][A-Za-z0-9._-]*)-VERIFY-(F\d+)\.md\b/m;

/** What `completed` prints and launches for one answer of the chain. */
export function chainStep(payload: string): ChainStep {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload);
  } catch {
    parsed = null;
  }
  const answer = parsed as { lines?: unknown; next?: { crew?: unknown; input?: Record<string, unknown> } } | null;
  if (answer !== null && typeof answer === "object" && Array.isArray(answer.lines)) {
    const lines = answer.lines.map(String);
    const next = answer.next;
    if (next?.crew === "dev-verify" && next.input !== undefined) {
      const { batch, plan, mode } = next.input;
      const shownMode = mode === "resume" ? " resume" : "";
      return { lines, launch: { crew: "dev-verify", input: { ...next.input }, instead: `/dev-verify ${batch} ${plan}${shownMode}` } };
    }
    return { lines };
  }
  // /dev-verify's own answer, drained here by the chain.
  const lines = payload.split("\n");
  // The VALID line is /dev-verify's own: at the start of a line, after the verdict file's, for that file's batch; a
  // gap that quotes it from model text launches nothing.
  const written = WRITTEN_LINE.exec(payload);
  const valid = written === null ? null : VALID_LINE.exec(payload.slice(written.index + written[0].length));
  if (valid === null || written === null || valid[1] !== written[3]) return { lines };
  const plan = `${written[1]}/${written[2]}-PLAN.md`;
  return {
    lines: [...lines, `→ the close follows: /dev-implement ${valid[1]} ${plan} --close`],
    launch: { crew: "dev-implement", input: { batch: valid[1], plan, close: true }, instead: `/dev-implement ${valid[1]} ${plan} --close` },
  };
}

export interface DevImplementDispatchDeps {
  session: Pick<SessionIo, "resolveEffectiveSessionMode" | "readState" | "writeState">;
  config: Pick<ConfigStore, "readValue" | "readFile">;
  files: Files;
  shell: Shell;
  /** The host's gate and its tools, each made when read: a host without the service fails there. */
  gate: () => PermissionRules;
  catalogue: () => Pick<ToolCatalogue, "find">;
  write(line: string): void;
}

export type DevImplementDispatch =
  | { refused: string }
  | { input: Record<string, unknown>; details: { ruleSets: string; rules: number; hooks: number } };

/** `/dev-implement …`'s dispatch, from the raw tokens: the refusal, written, or the crew's input and the launch's details. */
export async function runDevImplementDispatch(tokens: readonly string[], deps: DevImplementDispatchDeps): Promise<DevImplementDispatch> {
  const parsed = parseDevImplementArgs(tokens);
  if (!parsed.ok) {
    deps.write(parsed.text);
    return { refused: parsed.text };
  }
  const prContext = await readPullRequestContext({ catalogue: deps.catalogue, rules: deps.gate, session: deps.session });
  const line = writeModeRefusal(String(prContext.permissionMode ?? ""), "dev-implement", "writes files, commits and pushes");
  if (line !== null) {
    deps.write(line);
    return { refused: line };
  }
  const start = await startDevStep("dev-implement", {
    session: deps.session, config: deps.config, gate: deps.gate(), catalogue: deps.catalogue(),
  });
  if (!start.ok) {
    deps.write(start.line);
    return { refused: start.line };
  }
  for (const line of start.lines) deps.write(line);
  const unrecorded = await markActiveWorkflow(deps.session, parsed.args);
  if (unrecorded !== null) deps.write(unrecorded);
  // The budget is sized to the open steps of the sheet (the crew sizes for its default when they cannot be counted).
  // A correction adds one step, appended by the crew after this count.
  const open = parsed.args.close
    ? undefined
    : await countOpenSteps({ files: deps.files, shell: deps.shell, config: deps.config }, parsed.args.batch, parsed.args.plan);
  const steps = open === undefined || parsed.args.correction === null ? open : open + 1;
  const input = {
    ...parsed.args, ...start.input, effort: await storedEffort(deps.session), ...(steps === undefined ? {} : { steps }), ...prContext,
  };
  return { input, details: { ruleSets: start.sets.join(" "), rules: start.rules, hooks: start.hooks.length } };
}

/** What a hop of a chain reads before it launches: the gate put back, the session's context read again. */
export interface ChainHopDeps {
  /** Puts the step's rules back in the gate; its refusal launches nothing. */
  reapply: (step: DevStep) => string | null;
  /** The session's context as it is now (readPullRequestContext); a read that fails leaves the record's in force. */
  context: () => Promise<PullRequestContext>;
}

/** The line a hop prints when the session's context could not be read again: the crew reads its record. */
export const CONTEXT_NOT_READ_LINE = "⚠ the session's mode could not be read again: the context read at the launch applies";

/** What the close writes, for the refusal of a read-only mode. */
const CLOSE_WRITES = { step: "dev-implement", what: "commits (the close of the batch)" };

/** The session's context now, or null when it cannot be read (a throw, an empty mode). */
export async function freshContext(read: () => Promise<PullRequestContext>): Promise<PullRequestContext | null> {
  try {
    const context = await read();
    return context.permissionMode.trim() === "" ? null : context;
  } catch {
    return null;
  }
}

/** The launch input with the fresh mode and rules; the github tool as the input names it, else as the session has it. */
export function withContext(input: Record<string, unknown>, context: PullRequestContext): Record<string, unknown> {
  return {
    ...input, permissionMode: context.permissionMode, permissionRules: [...context.permissionRules],
    githubTool: typeof input.githubTool === "boolean" ? input.githubTool : context.githubTool,
  };
}

/**
 * A hop that writes, with the session's context read again (Orkeon #220): refused, with the command to type, when
 * the mode no longer lets `writes.step` write; the launch with the fresh context in its input otherwise; the launch
 * as it is, said in a line, when the context cannot be read.
 */
export async function writingHop(
  launch: ChainLaunch, read: () => Promise<PullRequestContext>, writes: { step: string; what: string },
): Promise<ChainStep> {
  const context = await freshContext(read);
  if (context === null) return { lines: [CONTEXT_NOT_READ_LINE], launch };
  const refusal = writeModeRefusal(context.permissionMode, writes.step, writes.what);
  if (refusal !== null) return { lines: [refusal, `then type ${launch.instead}`] };
  return { lines: [], launch: { ...launch, input: withContext(launch.input, context) } };
}

/**
 * What `completed` prints for one answer of the chain, and the launch that follows. No dispatch runs before a
 * chained launch: the gate is checked and the step's rules put back by `reapply`, whose refusal launches nothing;
 * the close then reads the session's context again (writingHop); the audit is launched as the crew named it.
 */
export async function nextLaunch(result: CrewCompletion, deps: ChainHopDeps): Promise<ChainStep> {
  if (!result.success) return { lines: [`✗ the dev-implement chain failed: ${result.error ?? "unknown"}`] };
  const step = chainStep(String(result.payload ?? ""));
  if (step.launch === undefined) return step;
  const refusal = deps.reapply(step.launch.crew === "dev-verify" ? "dev-verify" : "dev-implement");
  if (refusal !== null) return { lines: [...step.lines, `✗ ${refusal}`, `then type ${step.launch.instead}`] };
  if (step.launch.crew !== "dev-implement") return step;
  const hop = await writingHop(step.launch, deps.context, CLOSE_WRITES);
  return hop.launch === undefined ? { lines: [...step.lines, ...hop.lines] } : { lines: [...step.lines, ...hop.lines], launch: hop.launch };
}

/** The lines a chained launch leaves: none once launched; its refusal or its failure, and the command to type instead.
 *  `options` go to the launch as they are (`{ chain: "continue" }` for a driver that relaunches itself). */
export function launchChained(
  launch: ChainLaunch,
  run: (crew: string, input: Record<string, unknown>, options?: CrewLaunchOptions) => LaunchResult,
  options?: CrewLaunchOptions,
): string[] {
  try {
    const launched = run(launch.crew, launch.input, options);
    return "refused" in launched ? [`✗ ${launched.refused}`, `then type ${launch.instead}`] : [];
  } catch (e) {
    return [`✗ ${launch.crew} could not be launched (${String((e as Error)?.message ?? e).split("\n")[0]}): type ${launch.instead}`];
  }
}
