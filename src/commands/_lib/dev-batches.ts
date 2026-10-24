// /dev-batches: its arguments, and what its `completed` does with each answer of the chain, told apart by
// the crew that answered (`result.intent`, the crew's name: ScriptHostFacade.runCrewAsync). The dev-batches
// crew answers JSON `{ lines, next? }`: its `next` (/dev-implement on one batch) is launched. /dev-implement and
// /dev-verify answer as in /dev-implement's own chain (dev-implement.ts chainStep): the audit, then on VALID the
// close, which commits the batch and is sent `push: false` (the run pushes at its own close; the dev-implement
// crew keeps it, run-dev-implement.ts implementInputs). An answer of theirs
// that launches nothing (the batch committed, a stop, a GAPS verdict) launches the dev-batches crew again with
// the answer's last lines: it logs what came of the batch and names the next one. Pure.
import { isCode } from "../../shared/domain/dev/artefacts.ts";
import { chainStep } from "./dev-implement.ts";
import type { ChainLaunch } from "./dev-implement.ts";

export const DEV_BATCHES_USAGE = "usage: /dev-batches [<code>] [--pr]   (no code: the run in progress goes on)";
export interface DevBatchesArgs { code: string | null; pr: boolean }

export function parseDevBatchesArgs(tokens: readonly string[]): { ok: true; args: DevBatchesArgs } | { ok: false; text: string } {
  let code: string | null = null;
  let pr = false;
  for (const tok of tokens) {
    if (tok === "--pr") pr = true;
    else if (tok === "--help" || tok === "-h") return { ok: false, text: DEV_BATCHES_USAGE };
    else if (tok.startsWith("-")) return { ok: false, text: `dev-batches: unknown option '${tok}' (--pr)` };
    else if (!isCode(tok)) return { ok: false, text: `dev-batches: '${tok}' is not a work code (a folder name of the work folder)` };
    else if (code !== null) return { ok: false, text: `dev-batches: one code at most, not '${code}' and '${tok}'` };
    else code = tok;
  }
  return { ok: true, args: { code, pr } };
}

/** The lines of an answer handed back to the dev-batches crew. */
export const AFTER_LINES = 20;
export const DEV_BATCHES_AGAIN = "/dev-batches";

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
