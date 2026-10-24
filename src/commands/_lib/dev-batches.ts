// /dev-batches: its arguments, and what its `completed` does with each answer of the chain, told apart by
// the crew that answered (`result.intent`, the crew's name: ScriptHostFacade.runCrewAsync). The dev-batches
// crew answers JSON `{ lines, next? }`: its `next` (/dev-implement on one batch) is launched. /dev-implement and
// /dev-verify answer as in /dev-implement's own chain (dev-implement.ts chainStep): the audit, then on VALID the
// close, which commits the batch and is sent `push: false` (the run pushes at its own close; the dev-implement
// crew keeps it, run-dev-implement.ts implementInputs). An answer of theirs
// that launches nothing (the batch committed, a stop, a GAPS verdict) launches the dev-batches crew again with
// the answer's last lines: it logs what came of the batch and names the next one. With `--concurrency n` (2 to 4)
// the crew runs a wave of batches itself, each under its own worktree, and answers `next: dev-batches` for the
// next wave: launched as it is, one hop per wave. Pure.
import { isCode } from "../../shared/domain/dev/artefacts.ts";
import { checkConcurrency, concurrencyModeRefusal } from "../../shared/domain/dev/batches-concurrency.ts";
import { chainStep } from "./dev-implement.ts";
import type { ChainLaunch } from "./dev-implement.ts";

export const DEV_BATCHES_USAGE =
  "usage: /dev-batches [<code>] [--pr] [--concurrency n]   (no code: the run in progress goes on; n from 1 to 4, above 1 in bypassPermissions)";
/** `concurrency` only when the option is typed: without it the run goes on as the plan's run in progress was (one at a
 *  time when none is); `--concurrency 1` goes back to one at a time. */
export interface DevBatchesArgs { code: string | null; pr: boolean; concurrency?: number }

/** The arguments; `--concurrency <n>` (or `=<n>`) is checked: 1 to 4. */
export function parseDevBatchesArgs(tokens: readonly string[]): { ok: true; args: DevBatchesArgs } | { ok: false; text: string } {
  let code: string | null = null;
  let pr = false;
  let concurrency: number | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "--concurrency" || tok.startsWith("--concurrency=")) {
      const value = tok === "--concurrency" ? tokens[++i] : tok.slice("--concurrency=".length);
      if (value === undefined) return { ok: false, text: "dev-batches: --concurrency needs a number" };
      const c = checkConcurrency(value);
      if (!c.ok) return { ok: false, text: `dev-batches: ${c.line}` };
      concurrency = c.value;
      continue;
    }
    if (tok === "--pr") pr = true;
    else if (tok === "--help" || tok === "-h") return { ok: false, text: DEV_BATCHES_USAGE };
    else if (tok.startsWith("-")) return { ok: false, text: `dev-batches: unknown option '${tok}' (--pr, --concurrency)` };
    else if (!isCode(tok)) return { ok: false, text: `dev-batches: '${tok}' is not a work code (a folder name of the work folder)` };
    else if (code !== null) return { ok: false, text: `dev-batches: one code at most, not '${code}' and '${tok}'` };
    else code = tok;
  }
  return { ok: true, args: concurrency !== undefined ? { code, pr, concurrency } : { code, pr } };
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
  return { lines, launch: { crew: "dev-implement", input: { ...a.next.input }, instead: `/dev-implement ${batch} ${plan}` } };
}

/** What `completed` prints and launches for one answer, by the crew that gave it. */
export function batchesChainStep(intent: string, payload: string): BatchesChainStep {
  if (intent === "dev-batches") return batchesAnswer(payload);
  if (intent !== "dev-implement" && intent !== "dev-verify") return { lines: payload.split("\n") };
  const step = chainStep(payload);
  if (step.launch !== undefined) {
    const close = step.launch.crew === "dev-implement" && step.launch.input.close === true;
    return close ? { lines: step.lines, launch: { ...step.launch, input: { ...step.launch.input, push: false } } } : step;
  }
  const after = step.lines.filter((l) => l.trim() !== "").slice(-AFTER_LINES);
  return { lines: step.lines, launch: { crew: "dev-batches", input: { after }, instead: DEV_BATCHES_AGAIN } };
}
