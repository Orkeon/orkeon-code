// The dev crews' onToolCall and onToolResult (RT-04), built from a crew's inputs and handed to every act through
// createLlm(ctx.llm, callbacks). The host's gate runs first and the callback sees only the calls it allowed: the
// callback re-checks the call against the crew's guard (shared/domain/dev/call-guard.ts), then runs the pre-tool
// hooks; after the call, the post-tool hooks. Before a file_write under a writing role's rewrite rule, it reads the
// path once: a file the runtime says is not found is a new one, which file_write may create. It answers "allow" or { deny } only: no "ask" (an approval asked in
// the middle of a crew's turn may not be answered by the REPL) and no rewritten input. Each crew that imports
// this module bundles its own copy; nothing is shared between runs.
import type { Files, Logger, Shell } from "../../application/ports.ts";
import { buildCallGuard, checkToolCall, denyText, hookCommand } from "../../domain/dev/call-guard.ts";
import { REWRITE_TOOL } from "../../domain/agent-policy/rule-sets.ts";
import { sameToolName } from "../../domain/agent-policy/permission.ts";
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

/** Runs one hook; undefined when it exited 0, else what went wrong in one line. */
async function runHook(deps: ToolCallbackDeps, hook: ToolHook, tool: string, input: unknown): Promise<string | undefined> {
  const command = hookCommand(hook, tool, input);
  const label = `${hook.event} hook #${hook.n} (${command})`;
  try {
    const r = await deps.shell.run(command, { timeoutSeconds: HOOK_TIMEOUT_SECONDS });
    if (r.timedOut) return `${label} stopped after ${HOOK_TIMEOUT_SECONDS} s`;
    if (r.exitCode === 0) return undefined;
    const said = firstLine(r.stderr, r.stdout);
    return `${label} exited ${r.exitCode}${said ? `: ${said}` : ""}`;
  } catch (e) {
    return `${label} could not run: ${String((e as Error)?.message ?? e).split("\n")[0]}`;
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
  const pre = guard.hooks.filter((h) => h.event === "pre-tool");
  const post = guard.hooks.filter((h) => h.event === "post-tool");
  return {
    guard,
    forAct(mode, gateEnabled) {
      return {
        async onToolCall(call) {
          // A throw would deny too, with the bare message: the catch keeps the step's name in front.
          try {
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
              const failed = await runHook(deps, hook, call.name, call.input);
              if (failed !== undefined) {
                deps.log?.info(`${guard.step}: pre-tool hook #${hook.n} refused ${call.name}`);
                return { deny: `${guard.step}: refused by ${failed}\nThe call did not run: change it, or ask the user to fix the hook.` };
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
            const failed = await runHook(deps, hook, call.name, call.input);
            if (failed !== undefined) notes.push(`[${failed}]`);
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
