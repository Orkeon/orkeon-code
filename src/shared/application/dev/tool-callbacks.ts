// The dev crews' onToolCall and onToolResult (RT-04), built from a crew's inputs and handed to every act through
// createLlm(ctx.llm, callbacks). The host's gate runs first and the callback sees only the calls it allowed: the
// callback hands the call to the decision (tool-call-policy.ts) over probes built here: the memory folder read
// once, the path a file_write under a rewrite rule names read once (a file the runtime says is not found is a new
// one, which file_write may create), and the hooks run in the shell; it logs the decision's notes. After the call,
// the post-tool hooks. It answers "allow", { deny } or the input with its path resolved: no "ask" (an approval
// asked in the middle of a crew's turn may not be answered by the REPL). Each crew that imports this module bundles
// its own copy; nothing is shared between runs.
import type { Files, Logger, Shell } from "../ports.ts";
import { buildCallGuard, hookCommand } from "../../domain/dev/call-guard.ts";
import { resolvePathInput } from "../../domain/dev/path-args.ts";
import { OPERATIONS_TOOL } from "../../domain/agent-policy/rule-sets.ts";
import { sameToolName } from "../../domain/agent-policy/permission.ts";
import { memoryWriteRefusal } from "../../domain/shared-memory/layout.ts";
import { mapStrings, textFromRoot } from "../../domain/dev/path-rebase.ts";
import type { CallGuard, CallGuardSpec, ToolHook } from "../../domain/dev/call-guard.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { judgeToolCall, memoryDenyText } from "./tool-call-policy.ts";
import type { CallProbes, HookFailure, ToolCallVerdict } from "./tool-call-policy.ts";

export type { HookFailure, ToolCallVerdict } from "./tool-call-policy.ts";

/** A hook is stopped after this many seconds, and refuses (pre) or is reported (post). */
export const HOOK_TIMEOUT_SECONDS = 60;

/** The runtime's verdict and result callbacks, as ActOptions types them (the subset this module returns). */
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

/** The callbacks of an act that runs no dev step (the main loop): the shared memory's guard alone, no hook. */
export function memoryGuardCallbacks(memoryDir: () => Promise<string>): Pick<ToolCallbacks, "forAct"> {
  const dir = onceMemoryDir(memoryDir);
  return {
    forAct() {
      return {
        async onToolCall(call) {
          try {
            const why = memoryWriteRefusal(await dir(), call.name, call.input);
            return why === null ? "allow" : { deny: memoryDenyText(why) };
          } catch (e) {
            return { deny: `the shared memory's guard failed: ${String((e as Error)?.message ?? e)}` };
          }
        },
        async onToolResult() { return undefined; },
      };
    },
  };
}

/** True when the runtime says `path` names no file (its "not found"), false when it reads; undefined otherwise. */
export async function isNewFile(files: Pick<Files, "read">, path: string): Promise<boolean | undefined> {
  const trimmed = path.trim();
  if (trimmed === "") return undefined;
  const virtual = trimmed.startsWith("/") ? trimmed : `${WORKSPACE}/${trimmed.replace(/^(\.\/)+/, "")}`;
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
  const files = deps.files;
  const probes: CallProbes = {
    memoryDir: memoryDir ?? (async () => null),
    newFile: files === undefined ? async () => undefined : (path) => isNewFile(files, path),
    runHook: (hook, tool, input) => runHooks(deps, hook, tool, input),
  };
  const post = guard.hooks.filter((h) => h.event === "post-tool");
  return {
    guard,
    forAct(mode, gateEnabled) {
      return {
        async onToolCall(call): Promise<ToolCallVerdict> {
          const { verdict, notes } = await judgeToolCall(guard, call, { mode, gateEnabled }, probes);
          for (const note of notes) deps.log?.info(note);
          return verdict;
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

/**
 * The callbacks of a batch run under its working root (a parallel /dev-batches): every string of a call's input
 * comes back from the root to `/workspace` before `callbacks` see it, so the rule sets, the rewrite rule, the hooks
 * and the writes a role reports name the logical checkout; a relative path is resolved under the root first, and
 * the tool receives it resolved. Without a root, `callbacks` themselves.
 */
export function rootedCallbacks<C extends Pick<ToolCallbacks, "forAct">>(callbacks: C, root: string | undefined): C {
  if (root === undefined || root === "") return callbacks;
  const logical = (call: { name: string; input: unknown }) => ({ name: call.name, input: mapStrings(call.input, (t) => textFromRoot(t, root)) });
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        onToolCall: async (call) => {
          const resolved = resolvePathInput(call.name, call.input, root);
          const verdict = await inner.onToolCall(logical(resolved === null ? call : { name: call.name, input: resolved }));
          return verdict === "allow" && resolved !== null ? { input: resolved } : verdict;
        },
        onToolResult: (call, result) => inner.onToolResult(logical(call), result),
      };
    },
  };
}
