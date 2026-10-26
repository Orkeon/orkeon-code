// The hooks, layouts, file readers and expected refusals the dev crews' tool callbacks are tested with.
import { HOOK_TIMEOUT_SECONDS, devToolCallbacks, memoryGuardCallbacks } from "./tool-callbacks.ts";
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const PRE = { event: "pre-tool", command: "bash pre.sh {tool} {path}" };
export const POST = { event: "post-tool", command: "bash post.sh {tool}" };

/** The callbacks of a dev-plan step with `hooks` over a FakeShell and a FakeLogger, and their act in plan mode, the gate on. */
export function setup(hooks: unknown[] = [], spec: Record<string, unknown> = {}) {
  const shell = new FakeShell();
  const log = new FakeLogger();
  const callbacks = devToolCallbacks({ step: "dev-plan", hooks, ...spec }, { shell, log });
  return { shell, log, callbacks, act: callbacks.forAct("plan", true) };
}

/** The pre-tool hooks run for a file_read of src/a.ts, in order, the stop hook between them left out. */
export const PRE_HOOK_CALLS = [
  { command: `bash pre.sh file_read ${WORKSPACE}/src/a.ts`, options: { timeoutSeconds: HOOK_TIMEOUT_SECONDS } },
  { command: "bash two.sh", options: { timeoutSeconds: HOOK_TIMEOUT_SECONDS } },
];

export interface HookInputsCase {
  name: string;
  tool: string;
  input: unknown;
  expected: unknown[];
}

/** Calls whose hooks run once on their whole input. */
export const WHOLE_HOOK_INPUTS: readonly HookInputsCase[] = [
  { name: "hands a file_read's hooks its input as it is", tool: "file_read", input: { path: "a" }, expected: [{ path: "a" }] },
  { name: "hands an edit_batch without operations its input as it is", tool: "edit_batch", input: { operations: [] }, expected: [{ operations: [] }] },
];

export const FAILED_HOOK_DENY =
  `dev-plan: refused by pre-tool hook #1 (bash pre.sh file_read ${WORKSPACE}/a.ts) exited 2: no reads today\n` +
  "The call did not run: change it, or ask the user to fix the hook.";

export const MOUNT_DENIAL = "Command argument denied by file system: Access denied to '/cli-commands'";

export const MOUNT_DENY =
  "dev-plan: the runtime's mount check refused the command line of pre-tool hook #1 " +
  `(bash pre.sh directory_read /cli-commands), which did not run: ${MOUNT_DENIAL}\n` +
  "The call did not run: a hook's command line may name no path its program may not write; ask the user to change the hook.";

/** The layout of the rewrite rule's tests. */
export const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };

/** A file reader over a map: an absent path throws the runtime's message, every read throws `fail` when given. */
export const files = (present: Record<string, string>, fail?: string) => ({
  reads: [] as string[],
  async read(path: string) {
    this.reads.push(path);
    if (fail !== undefined) throw new Error(fail);
    if (!(path in present)) throw new Error(`File not found: ${path}`);
    return present[path];
  },
});

/** The act of an implementer of dev-implement in acceptEdits, the gate on, over `reader` when given. */
export const implementer = (reader?: ReturnType<typeof files>) => devToolCallbacks(
  { step: "dev-implement", role: "implementer", layout: LAYOUT }, { shell: new FakeShell(), ...(reader === undefined ? {} : { files: reader }) },
).forAct("acceptEdits", true);

export interface NewFileCase {
  name: string;
  reader: () => ReturnType<typeof files>;
  path: string;
  expected: boolean | undefined;
}

export const NEW_FILES: readonly NewFileCase[] = [
  { name: "tells a file the runtime does not find as new", reader: () => files({}), path: "src/a.ts", expected: true },
  { name: "tells a file the runtime reads as not new", reader: () => files({ [`${WORKSPACE}/src/a.ts`]: "" }), path: `${WORKSPACE}/src/a.ts`, expected: false },
  { name: "cannot tell a file whose read fails otherwise", reader: () => files({}, "timeout"), path: "src/a.ts", expected: undefined },
  { name: "cannot tell a blank path", reader: () => files({}), path: "  ", expected: undefined },
];

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

/** A reader that finds every file, its reads recorded. */
export function readerOfAll() {
  const reads: string[] = [];
  return { reads, reader: { async read(path: string) { reads.push(path); return "x"; } } };
}

/** What a pilot whose domain is /etc and whose layout lacks infrastructure and tests is warned. */
export const PILOT_WARNINGS = [
  `warn: dev-plan: root '/etc' is outside ${WORKSPACE}: no rule`,
  "warn: dev-plan: the pack gives no layout.infrastructure: no rule on it",
  "warn: dev-plan: the pack gives no layout.tests: no rule on it",
];

/** The main loop's act guarded on the memory folder "mem", the reads of the folder counted. */
export function mainLoopGuard() {
  const counter = { reads: 0 };
  const act = memoryGuardCallbacks(async () => { counter.reads += 1; return "mem"; }).forAct("bypassPermissions", true);
  return { act, counter };
}

export const SHELL_WRITE_INTO_MEMORY = { name: "shell_command", input: { command: "cd mem && printf x > ENTRIES/a.md" } };
