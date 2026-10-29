// One batch of /dev-batches (`/dev-batches <code> F<n> …`, its alias /dev-implement): its dispatch, and what its
// `completed` does with each answer of the batch's chain. The dev-implement crew answers JSON `{ lines, next? }`: the
// lines are printed and `next` (the audit, its input as the crew wrote it: mode, hooks, effort) is launched. The
// audit (the dev-verify crew), launched from here, drains to the same `completed` as plain text: printed, and on its
// VALID line the close is launched (`/dev-batches <plan> F<n> --close`). A launch that cannot run prints the command
// for the user instead. Before a hop that writes (the close), the session's context is read again (Orkeon #220,
// `completed` awaited by the host): a mode that no longer allows it refuses the hop with the command to type, else the
// fresh mode, rules and github tool ride in the launch input, so the crew reads them rather than the context its
// record kept at the launch; a context that cannot be read leaves the record's in force, said in a line. The dispatch
// (runDevImplementDispatch) checks the mode, starts the step and sizes the run to the sheet's open steps over the
// ports it is handed; the chain's launch is handed to it too.
import type { CrewLaunchOptions, Files, PermissionRules, Shell, ToolCatalogue } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { SessionIo } from "../../../shared/application/session-io.ts";
import { auditCommand, closeCommand } from "../../../shared/domain/dev/verdict-format.ts";
import type { DevStep } from "../../../shared/domain/dev/step-rules.ts";
import { countOpenSteps } from "../../../crews/dev-implement/application/count-open-steps.ts";
import { markActiveWorkflow, startDevStep, writeModeRefusal } from "../dev-step.ts";
import type { CrewCompletion, LaunchResult } from "../dispatch.ts";
import { storedEffort } from "../effort.ts";
import { readPullRequestContext } from "../pr-context.ts";
import type { PullRequestContext } from "../pr-context.ts";

/** One batch of a plan, as `/dev-batches <code> F<n> [--close [--pr]] [— correction: <finding>]` reads it
 *  (dev-batches.ts parseDevBatchesArgs): the batch, its plan (a code or a `<path>/<CODE>-PLAN.md`, null to find it). */
export interface DevImplementArgs { batch: string; plan: string | null; close: boolean; pr: boolean; correction: string | null }

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
      const instead = auditCommand(String(plan ?? "<code>"), String(batch), mode === "resume" ? "resume" : undefined);
      return { lines, launch: { crew: "dev-verify", input: { ...next.input }, instead } };
    }
    return { lines };
  }
  // The audit's own answer, drained here by the chain.
  const lines = payload.split("\n");
  // The VALID line is the audit's own: at the start of a line, after the verdict file's, for that file's batch; a
  // gap that quotes it from model text launches nothing.
  const written = WRITTEN_LINE.exec(payload);
  const valid = written === null ? null : VALID_LINE.exec(payload.slice(written.index + written[0].length));
  if (valid === null || written === null || valid[1] !== written[3]) return { lines };
  const plan = `${written[1]}/${written[2]}-PLAN.md`;
  return {
    lines: [...lines, `→ the close follows: ${closeCommand(plan, valid[1])}`],
    launch: { crew: "dev-implement", input: { batch: valid[1], plan, close: true }, instead: closeCommand(plan, valid[1]) },
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

/** One batch's dispatch, from its parsed arguments: the refusal, written, or the crew's input and the launch's details. */
export async function runDevImplementDispatch(args: DevImplementArgs, deps: DevImplementDispatchDeps): Promise<DevImplementDispatch> {
  const prContext = await readPullRequestContext({ catalogue: deps.catalogue, rules: deps.gate, session: deps.session });
  const line = writeModeRefusal(String(prContext.permissionMode ?? ""), "dev-batches", "writes files, commits and pushes");
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
  const unrecorded = await markActiveWorkflow(deps.session, args);
  if (unrecorded !== null) deps.write(unrecorded);
  // The budget is sized to the open steps of the sheet (the crew sizes for its default when they cannot be counted).
  // A correction adds one step, appended by the crew after this count.
  const open = args.close
    ? undefined
    : await countOpenSteps({ files: deps.files, shell: deps.shell, config: deps.config }, args.batch, args.plan);
  const steps = open === undefined || args.correction === null ? open : open + 1;
  const input = {
    ...args, ...start.input, effort: await storedEffort(deps.session), ...(steps === undefined ? {} : { steps }), ...prContext,
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
const CLOSE_WRITES = { step: "dev-batches", what: "commits (the close of the batch)" };

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
  if (!result.success) return { lines: [`✗ the batch's chain failed: ${result.error ?? "unknown"}`] };
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
