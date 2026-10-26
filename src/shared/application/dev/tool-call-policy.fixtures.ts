// The guards, probes and expected refusals the tool-call decision is tested with.
import { buildCallGuard } from "../../domain/dev/call-guard.ts";
import type { CallGuard, CallGuardSpec, ToolHook } from "../../domain/dev/call-guard.ts";
import type { CallProbes, HookFailure } from "./tool-call-policy.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const PRE = { event: "pre-tool", command: "bash pre.sh {tool} {path}" };
export const TWO = { event: "pre-tool", command: "bash two.sh" };

/** The acts the decision is asked for, the host's gate on unless said. */
export const PLAN_ACT = { mode: "plan", gateEnabled: true };
export const EDITS_ACT = { mode: "acceptEdits", gateEnabled: true };
export const BYPASS_ACT = { mode: "bypassPermissions", gateEnabled: true };

/** The layout of the rewrite rule's tests. */
export const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };

/** The guard of a dev-plan step with `hooks`. */
export const planGuard = (hooks: unknown[] = []): CallGuard => buildCallGuard({ step: "dev-plan", hooks });

/** The guard of an implementer of dev-implement, its rewrite rule on LAYOUT, with `hooks`. */
export const implementerGuard = (hooks: unknown[] = []): CallGuard =>
  buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT, hooks } satisfies CallGuardSpec);

export interface ProbeSettings {
  /** The shared memory's folder; none: not guarded. */
  memoryDir?: string;
  /** What newFile answers; none: it cannot tell. */
  newFile?: boolean;
  /** What runHook answers for the hook of each number; none: the hook passes. */
  failures?: Record<number, HookFailure>;
  /** runHook throws this message. */
  hookThrows?: string;
}

/** One hook the probes were asked to run. */
export interface HookRun { n: number; tool: string; input: unknown }

/** Probes answering as `settings` say, each recording what it was asked under `asked`. */
export function probes(settings: ProbeSettings = {}) {
  const asked = { memoryDir: 0, newFile: [] as string[], hooks: [] as HookRun[] };
  const answering: CallProbes & { asked: typeof asked } = {
    asked,
    async memoryDir() {
      asked.memoryDir += 1;
      return settings.memoryDir ?? null;
    },
    async newFile(path: string) {
      asked.newFile.push(path);
      return settings.newFile;
    },
    async runHook(hook: ToolHook, tool: string, input: unknown) {
      asked.hooks.push({ n: hook.n, tool, input });
      if (settings.hookThrows !== undefined) throw new Error(settings.hookThrows);
      return settings.failures?.[hook.n];
    },
  };
  return answering;
}

export const GIT_COMMIT_DENY =
  "dev-plan: refused by 'deny shell_command command=*git commit*' of the rule set git-readonly\n" +
  "git commands that change the repository, its branches or its remotes are refused during /dev-plan: do without this call.";

export const HOOK_FAILED: HookFailure = { by: "hook", text: "pre-tool hook #1 (bash pre.sh file_read) exited 2: no reads today" };
export const HOOK_FAILED_DENY =
  "dev-plan: refused by pre-tool hook #1 (bash pre.sh file_read) exited 2: no reads today\n" +
  "The call did not run: change it, or ask the user to fix the hook.";

export const MOUNT_STOPPED: HookFailure = { by: "mount-check", text: "the runtime's mount check refused the command line of pre-tool hook #1" };
export const MOUNT_STOPPED_DENY =
  "dev-plan: the runtime's mount check refused the command line of pre-tool hook #1\n" +
  "The call did not run: a hook's command line may name no path its program may not write; ask the user to change the hook.";

export const RESOLVED_NOTE = "dev-plan: file_read: a relative path resolved under the checkout";

export const MEMORY_DENY_X =
  "refused by the shared memory's guard: x\n" +
  "The shared memory's candidates and entries are written by memory_push and /memory-admit only: do without this call.";

export interface NewFileQuestionCase {
  name: string;
  guard: () => CallGuard;
  call: { name: string; input: unknown };
  asked: string[];
}

/** The calls the decision asks, or not, whether they name a new file. */
export const NEW_FILE_QUESTIONS: readonly NewFileQuestionCase[] = [
  {
    name: "a file_write with a string path under a rewrite rule", guard: () => implementerGuard(),
    call: { name: "file_write", input: { path: `${WORKSPACE}/src/domain/a.ts`, content: "y" } }, asked: [`${WORKSPACE}/src/domain/a.ts`],
  },
  {
    name: "not a file_write whose path is no string", guard: () => implementerGuard(),
    call: { name: "file_write", input: { path: 7, content: "y" } }, asked: [],
  },
  {
    name: "not a file_read under a rewrite rule", guard: () => implementerGuard(),
    call: { name: "file_read", input: { path: `${WORKSPACE}/src/domain/a.ts` } }, asked: [],
  },
  {
    name: "not a file_write without a rewrite rule", guard: () => planGuard(),
    call: { name: "file_write", input: { path: `${WORKSPACE}/src/domain/a.ts`, content: "y" } }, asked: [],
  },
];

export const BATCH = { operations: [{ kind: "ensure_section", path: ".orkeon/memory/entries/decision/x.md", selector: "## A", text: "b" }] };

export interface MemoryCallCase {
  name: string;
  call: { name: string; input: unknown };
}

/** Writes into the shared memory the gate cannot read. */
export const UNREADABLE_MEMORY_WRITES: readonly MemoryCallCase[] = [
  { name: "an edit_batch operation", call: { name: "edit_batch", input: BATCH } },
  { name: "a path in another case", call: { name: "file_write", input: { path: ".Orkeon/Memory/Entries/x.md", content: "x" } } },
];
