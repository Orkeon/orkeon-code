// What a dev crew's onToolCall decides for one call the host's gate allowed, over probes the callbacks build
// (tool-callbacks.ts): the path resolved under the checkout first, then the shared memory's guard, then the crew's
// guard (shared/domain/dev/call-guard.ts) told whether a file_write under a rewrite rule names a new file, then the
// pre-tool hooks, stopped at the first that fails. It holds the order and the refusals' texts; what the probes read
// (the memory folder, the file, the hook's shell) is the callbacks'. No port: the probes are plain functions.
import { checkToolCall, denyText } from "../../domain/dev/call-guard.ts";
import type { ActFacts, CallGuard, ToolHook } from "../../domain/dev/call-guard.ts";
import { resolvePathInput } from "../../domain/dev/path-args.ts";
import { REWRITE_TOOL } from "../../domain/agent-policy/rule-sets.ts";
import { sameToolName } from "../../domain/agent-policy/permission.ts";
import { memoryWriteRefusal } from "../../domain/shared-memory/layout.ts";

/** The runtime's verdict and result callbacks, as ActOptions types them (the subset the callbacks return): allow,
 *  deny, or allow with the call's input rewritten (a relative path resolved). */
export type ToolCallVerdict = "allow" | { deny: string } | { input: unknown };

/** What stopped a hook: the hook itself (its exit, its time, its start), or the runtime's mount check, which refuses a
 *  command line naming a mount path the shell may not hand to its program, before the hook runs. */
export interface HookFailure { by: "hook" | "mount-check"; text: string }

/** What the decision asks of the world, one call at a time. */
export interface CallProbes {
  /** The shared memory's folder (memory.dir); null: the memory is not guarded here. */
  memoryDir(): Promise<string | null>;
  /** True when `path` names no file yet, false when it names one; undefined when it cannot be told. */
  newFile(path: string): Promise<boolean | undefined>;
  /** Runs one pre-tool hook on the call; undefined when it passed, else what stopped it. */
  runHook(hook: ToolHook, tool: string, input: unknown): Promise<HookFailure | undefined>;
}

/** The verdict, and the lines the callbacks log for it (at info). */
export interface CallJudgement { verdict: ToolCallVerdict; notes: string[] }

const MEMORY_GUARD = "refused by the shared memory's guard";
const MEMORY_CONTEXT = "The shared memory's candidates and entries are written by memory_push and /memory-admit only: do without this call.";

/** The refusal of a write into the shared memory, `why` its reason (memoryWriteRefusal), without a step's name. */
export function memoryDenyText(why: string): string {
  return `${MEMORY_GUARD}: ${why}\n${MEMORY_CONTEXT}`;
}

/** The refusal of a call a pre-tool hook stopped, led by the step's name. */
export function hookDenyText(step: string, failure: HookFailure): string {
  return failure.by === "mount-check"
    ? `${step}: ${failure.text}\nThe call did not run: a hook's command line may name no path its ` +
      "program may not write; ask the user to change the hook."
    : `${step}: refused by ${failure.text}\nThe call did not run: change it, or ask the user to fix the hook.`;
}

export async function judgeToolCall(
  guard: CallGuard, call: { name: string; input: unknown }, act: Omit<ActFacts, "newFile">, probes: CallProbes,
): Promise<CallJudgement> {
  const notes: string[] = [];
  const judged = (verdict: ToolCallVerdict): CallJudgement => ({ verdict, notes });
  // A throw would deny too, with the bare message: the catch keeps the step's name in front.
  try {
    // A relative path is resolved under the checkout first: the guard, the hooks and the tool see the resolved one
    // (the runtime would resolve it too, after the guard: too late for the rules and the hooks).
    const resolved = resolvePathInput(call.name, call.input);
    const input = resolved ?? call.input;
    if (resolved !== null) notes.push(`${guard.step}: ${call.name}: a relative path resolved under the checkout`);
    const dir = await probes.memoryDir();
    const memory = dir === null ? null : memoryWriteRefusal(dir, call.name, input);
    if (memory !== null) {
      notes.push(`${guard.step}: callback refused ${call.name}: ${memory}`);
      return judged({ deny: `${guard.step}: ${memoryDenyText(memory)}` });
    }
    const path = (input as { path?: unknown } | null)?.path;
    const rewrite = sameToolName(call.name, REWRITE_TOOL) && typeof path === "string"
      && guard.rules.some((r) => r.origin.kind === "rewrite");
    const newFile = rewrite ? await probes.newFile(path as string) : undefined;
    const verdict = checkToolCall(guard, call.name, input, { ...act, ...(newFile === undefined ? {} : { newFile }) });
    if (!verdict.allow) {
      notes.push(`${guard.step}: callback refused ${call.name}: ${verdict.reason}`);
      return judged({ deny: denyText(verdict) });
    }
    for (const hook of guard.hooks.filter((h) => h.event === "pre-tool")) {
      const failed = await probes.runHook(hook, call.name, input);
      if (failed === undefined) continue;
      notes.push(failed.by === "mount-check"
        ? `${guard.step}: the runtime's mount check refused pre-tool hook #${hook.n} for ${call.name}`
        : `${guard.step}: pre-tool hook #${hook.n} refused ${call.name}`);
      return judged({ deny: hookDenyText(guard.step, failed) });
    }
    return judged(resolved === null ? "allow" : { input: resolved });
  } catch (e) {
    return judged({ deny: `${guard.step}: the callback failed: ${String((e as Error)?.message ?? e)}` });
  }
}
