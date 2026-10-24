// The dev crews' onToolCall and onToolResult (RT-04), built from a crew's inputs and handed to every act through
// createLlm(ctx.llm, callbacks). The host's gate runs first and the callback sees only the calls it allowed: the
// callback re-checks the call against the crew's guard (shared/domain/dev/call-guard.ts), then runs the pre-tool
// hooks; after the call, the post-tool hooks. Before a file_write under a writing role's rewrite rule, it reads the
// path once: a file the runtime says is not found is a new one, which file_write may create. It answers "allow" or { deny } only: no "ask" (an approval asked in
// the middle of a crew's turn may not be answered by the REPL) and no rewritten input. Each crew that imports
// this module bundles its own copy; nothing is shared between runs.
import type { Files, Logger, Shell } from "../../application/ports.ts";
import { buildCallGuard, checkToolCall, denyText, hookCommand } from "../../domain/dev/call-guard.ts";
import { OPERATIONS_TOOL, REWRITE_TOOL } from "../../domain/agent-policy/rule-sets.ts";
import { sameToolName } from "../../domain/agent-policy/permission.ts";
import { memoryWriteRefusal } from "../../domain/shared-memory/layout.ts";
import type { CallGuard, CallGuardSpec, ToolHook } from "../../domain/dev/call-guard.ts";

/** A hook is stopped after this many seconds, and refuses (pre) or is reported (post). */
export const HOOK_TIMEOUT_SECONDS = 60;

/** The runtime's verdict and result callbacks, as ActOptions types them (the subset this module returns). */
export type ToolCallVerdict = "allow" | { deny: string };
export interface ActCallbacks {
  onToolCall: (call: { name: string; input: unknown }) => Promise<ToolCallVerdict>;
  onToolResult: (call: { name: string; input: unknown }, result: unknown) => Promise<void | { context: string }>;
}

/** What createLlm asks for each act: the callbacks for the act's mode and what the host says of its gate. */
export interface ToolCallbacks {
  guard: CallGuard;
  forAct(mode: string, gateEnabled: boolean | undefined): ActCallbacks;
}

export interface ToolCallbackDeps {
  shell: Pick<Shell, "run">;
  log?: Pick<Logger, "info" | "warn">;
  /** Reads a file_write's path under a rewrite rule; none: the rule holds on every path. */
  files?: Pick<Files, "read">;
  /** The shared memory's folder (memory.dir): the callback denies a write under its candidates or entries the gate
   *  cannot see (memoryWriteRefusal). None: not checked here. */
  memoryDir?: () => Promise<string>;
}

/** A reader of the memory folder that asks once: every call of an act needs it, the setting does not move. */
export function onceMemoryDir(read: () => Promise<string>): () => Promise<string> {
  let dir: Promise<string> | null = null;
  return () => (dir ??= read());
}

const MEMORY_GUARD = "refused by the shared memory's guard";
const MEMORY_CONTEXT = "The shared memory's candidates and entries are written by memory_push and /memory-admit only: do without this call.";

/** The callbacks of an act that runs no dev step (the main loop): the shared memory's guard alone, no hook. */
export function memoryGuardCallbacks(memoryDir: () => Promise<string>): Pick<ToolCallbacks, "forAct"> {
  const dir = onceMemoryDir(memoryDir);
  return {
    forAct() {
      return {
        async onToolCall(call) {
          try {
            const why = memoryWriteRefusal(await dir(), call.name, call.input);
            return why === null ? "allow" : { deny: `${MEMORY_GUARD}: ${why}\n${MEMORY_CONTEXT}` };
          } catch (e) {
            return { deny: `the shared memory's guard failed: ${String((e as Error)?.message ?? e)}` };
          }
        },
        async onToolResult() { return undefined; },
      };
    },
  };
}

const PROJECT = "/workspace";

/** True when the runtime says `path` names no file (its "not found"), false when it reads; undefined otherwise. */
export async function isNewFile(files: Pick<Files, "read">, path: string): Promise<boolean | undefined> {
  const trimmed = path.trim();
  if (trimmed === "") return undefined;
  const virtual = trimmed.startsWith("/") ? trimmed : `${PROJECT}/${trimmed.replace(/^(\.\/)+/, "")}`;
  try {
    await files.read(virtual, 1);
    return false;
  } catch (e) {
    return /not found|no such file|does not exist/i.test(String((e as Error)?.message ?? e)) ? true : undefined;
  }
}

/** The first line of what a hook printed, its error output first, at most 200 characters. */
function firstLine(stderr: string, stdout: string): string {
  const line = (stderr.trim() || stdout.trim()).split("\n")[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/** The inputs a hook sees for one call: the call's own, or one `{ path }` per operation of an edit_batch, so a
 *  per-file hook hears every file the batch writes. */
export function hookInputs(tool: string, input: unknown): unknown[] {
  const ops = (input as { operations?: unknown } | null)?.operations;
  if (!sameToolName(tool, OPERATIONS_TOOL) || !Array.isArray(ops) || ops.length === 0) return [input];
  return ops.map((op: unknown) => ({ path: (op as { path?: unknown } | null)?.path }));
}

/** What stopped a hook: the hook itself (its exit, its time, its start), or the runtime's mount check, which refuses a
 *  command line naming a mount path the shell may not hand to its program, before the hook runs. */
export interface HookFailure { by: "hook" | "mount-check"; text: string }

/** The runtime shell's refusal of a command line by its mount check (ShellCommandTool), else null. */
const MOUNT_DENIAL = /^(?:Command argument denied by file system|Argument denied):/;

function mountDenial(text: string): string | null {
  const line = text.trim().split("\n")[0] ?? "";
  return MOUNT_DENIAL.test(line) ? line : null;
}

async function runHooks(deps: ToolCallbackDeps, hook: ToolHook, tool: string, input: unknown): Promise<HookFailure | undefined> {
  for (const one of hookInputs(tool, input)) {
    const failed = await runHook(deps, hook, tool, one);
    if (failed !== undefined) return failed;
  }
  return undefined;
}

/** Runs one hook; undefined when it exited 0, else what went wrong in one line and who stopped it. */
async function runHook(deps: ToolCallbackDeps, hook: ToolHook, tool: string, input: unknown): Promise<HookFailure | undefined> {
  const command = hookCommand(hook, tool, input);
  const label = `${hook.event} hook #${hook.n} (${command})`;
  const refused = (denial: string): HookFailure =>
    ({ by: "mount-check", text: `the runtime's mount check refused the command line of ${label}, which did not run: ${denial}` });
  try {
    const r = await deps.shell.run(command, { timeoutSeconds: HOOK_TIMEOUT_SECONDS });
    // A refused command line comes back not completed: read as a timeout, it would hide the refusal.
    const denial = r.exitCode === 0 ? null : mountDenial(r.stderr);
    if (denial !== null) return refused(denial);
    if (r.timedOut) return { by: "hook", text: `${label} stopped after ${HOOK_TIMEOUT_SECONDS} s` };
    if (r.exitCode === 0) return undefined;
    const said = firstLine(r.stderr, r.stdout);
    return { by: "hook", text: `${label} exited ${r.exitCode}${said ? `: ${said}` : ""}` };
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    const denial = mountDenial(message);
    if (denial !== null) return refused(denial);
    return { by: "hook", text: `${label} could not run: ${message.split("\n")[0]}` };
  }
}

/** The text the model was shown for a result, as the runtime passes it: a string as is, else its JSON. */
function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result) ?? String(result);
  } catch {
    return String(result);
  }
}

export function createToolCallbacks(guard: CallGuard, deps: ToolCallbackDeps): ToolCallbacks {
  const memoryDir = deps.memoryDir === undefined ? undefined : onceMemoryDir(deps.memoryDir);
  const pre = guard.hooks.filter((h) => h.event === "pre-tool");
  const post = guard.hooks.filter((h) => h.event === "post-tool");
  return {
    guard,
    forAct(mode, gateEnabled) {
      return {
        async onToolCall(call) {
          // A throw would deny too, with the bare message: the catch keeps the step's name in front.
          try {
            const memory = memoryDir === undefined ? null : memoryWriteRefusal(await memoryDir(), call.name, call.input);
            if (memory !== null) {
              deps.log?.info(`${guard.step}: callback refused ${call.name}: ${memory}`);
              return { deny: `${guard.step}: ${MEMORY_GUARD}: ${memory}\n${MEMORY_CONTEXT}` };
            }
            const path = (call.input as { path?: unknown } | null)?.path;
            const rewrite = sameToolName(call.name, REWRITE_TOOL) && typeof path === "string" && deps.files !== undefined
              && guard.rules.some((r) => r.origin.kind === "rewrite");
            const newFile = rewrite ? await isNewFile(deps.files as Pick<Files, "read">, path as string) : undefined;
            const verdict = checkToolCall(guard, call.name, call.input, { mode, gateEnabled, ...(newFile === undefined ? {} : { newFile }) });
            if (!verdict.allow) {
              deps.log?.info(`${guard.step}: callback refused ${call.name}: ${verdict.reason}`);
              return { deny: denyText(verdict) };
            }
            for (const hook of pre) {
              const failed = await runHooks(deps, hook, call.name, call.input);
              if (failed?.by === "mount-check") {
                deps.log?.info(`${guard.step}: the runtime's mount check refused pre-tool hook #${hook.n} for ${call.name}`);
                return {
                  deny: `${guard.step}: ${failed.text}\nThe call did not run: a hook's command line may name no path its ` +
                    "program may not write; ask the user to change the hook.",
                };
              }
              if (failed !== undefined) {
                deps.log?.info(`${guard.step}: pre-tool hook #${hook.n} refused ${call.name}`);
                return { deny: `${guard.step}: refused by ${failed.text}\nThe call did not run: change it, or ask the user to fix the hook.` };
              }
            }
            return "allow";
          } catch (e) {
            return { deny: `${guard.step}: the callback failed: ${String((e as Error)?.message ?? e)}` };
          }
        },
        async onToolResult(call, result) {
          if (post.length === 0) return undefined;
          const notes: string[] = [];
          for (const hook of post) {
            const failed = await runHooks(deps, hook, call.name, call.input);
            if (failed !== undefined) notes.push(`[${failed.text}]`);
          }
          if (notes.length === 0) return undefined;
          deps.log?.warn(`${guard.step}: ${notes.length} post-tool hook(s) failed after ${call.name}`);
          return { context: [resultText(result), ...notes].join("\n") };
        },
      };
    },
  };
}

/** The callbacks of a dev crew from its spec (its step, role, roots and `hooks` input). */
export function devToolCallbacks(spec: CallGuardSpec, deps: ToolCallbackDeps): ToolCallbacks {
  const guard = buildCallGuard(spec);
  for (const problem of guard.problems) deps.log?.warn(`${spec.step}: ${problem}`);
  return createToolCallbacks(guard, deps);
}
