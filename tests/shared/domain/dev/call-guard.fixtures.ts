// The facts, layouts, tool calls and hook declarations the dev crews' call guard is tested on.
import type { ActFacts, CallGuardSpec, ToolHook } from "../../../../src/shared/domain/dev/call-guard.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** An act in plan mode on a host with a gate. */
export const ON: ActFacts = { mode: "plan", gateEnabled: true };
/** A file_write whose path the callbacks found absent: the rewrite rule does not hold on it. */
export const NEW: ActFacts = { ...ON, newFile: true };
/** An act on a host without a gate. */
export const off = (mode: string): ActFacts => ({ mode, gateEnabled: false });

export const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };

/** Guards that hold no rewrite rule: a step without a role, and the pilot. */
export const NO_REWRITE_SPECS: readonly CallGuardSpec[] = [{ step: "dev-plan" }, { step: "dev-verify", role: "pilot", layout: LAYOUT }];

/** The source file the rewrite rule is tested on. */
export const BIG = "src/domain/Orders.ts";

/** An operation of an edit_batch. */
export const op = (kind: string, path: string, text = "x") => ({ kind, path, selector: "A.b()", text, expected_hash: "h" });

/** A call: the tool, its input, and a label for the test name. */
export interface Call { tool: string; input: unknown; label: string }
const call = (tool: string, input: unknown, label = JSON.stringify(input)): Call => ({ tool, input, label: `${tool} ${label}` });

/** Calls no deny rule of dev-plan covers. */
export const UNCOVERED: readonly Call[] = [
  call("file_read", { path: "src/a.ts" }),
  call("shell_command", { command: "git status" }),
];

/** A covered path written with ./, // or .. */
export const UNNORMALISED_PATHS: readonly string[] = [
  "./src/domain/x.ts", "src//domain/x.ts", "tests/../src/domain/x.ts", `${WORKSPACE}/./src/domain/x.ts`,
];

/** Relative paths that climb out of /workspace and back into its tests. */
export const CLIMBING_PATHS: readonly string[] = [
  "../workspace/tests/a.test.ts", "../../workspace/tests/a.test.ts", "src/../../workspace/tests/a.test.ts",
];

/** Shell commands a dev-plan set covers once read. */
export const DISGUISED_COMMANDS: readonly string[] = [
  'git "push" origin', "git\tpush", "git 'commit' -m x", "bash  -c x", "python3 -Ic x", "perl -we x",
  "python3.12 -c x", "git pu\\sh", "node -pe 1",
];

/** Shell commands no dev-plan set covers. */
export const PLAIN_COMMANDS: readonly string[] = ["git status", 'git log --format="%h %s"', "python3 -m pytest -x", "npm test"];

/** git config commands that set a value. */
export const GIT_CONFIG_WRITES: readonly string[] = [
  "git config user.name x", "git -C /x config --file a.cfg a.b c", "cd x && git config 'a.b' c",
];

/** git config commands that read. */
export const GIT_CONFIG_READS: readonly string[] = [
  "git config --file a.cfg --list", "git config -f .gitmodules --get submodule.x.path", "git config user.name",
];

/** Paths and their normalised form. */
export const NORMALISED: ReadonlyArray<[path: string, normal: string]> = [
  [`${WORKSPACE}/./src//x.ts`, `${WORKSPACE}/src/x.ts`],
  [`${WORKSPACE}/tests/../src/x.ts`, `${WORKSPACE}/src/x.ts`],
  ["./src/x.ts", "src/x.ts"],
  ["../x", "../x"],
  ["/../workspace/x", `${WORKSPACE}/x`],
  ["./", "."],
];

/** What the test author with a test file pattern and a named stub may write. */
export const AUTHOR_WRITABLE: ReadonlyArray<Call & { facts: ActFacts; allow: boolean }> = [
  { ...call("file_write", { path: `${WORKSPACE}/src/domain/a.test.ts` }), facts: NEW, allow: true },
  { ...call("edit_file", { path: "./src/domain/a.ts" }), facts: ON, allow: true },
  { ...call("file_write", { path: "src/domain/b.ts" }), facts: ON, allow: false },
];

/** Paths the implementer's writable and test files leave refused. */
export const IMPLEMENTER_REFUSED: readonly string[] = ["tests/a.ts", "src/domain/a.test.ts"];

/** Facts of an act on an existing file. */
export const EXISTING_FILE_FACTS: readonly ActFacts[] = [ON, { ...ON, newFile: false }];

/** The editors the rewrite rule lets change a source file. */
export const NODE_EDITORS: readonly string[] = ["node_replace", "node_insert", "node_ensure", "edit_file"];

/** Batches the guard cannot read. */
export const UNREADABLE_BATCHES: readonly unknown[] = [
  {}, { operations: [] }, { operations: "x" }, { operations: [null] }, { operations: [{ kind: "node_replace" }] },
  { operations: [op("delete_file", "src/domain/a.ts")] }, "x",
];

/** Folder reads that reach below a pilot's roots. */
export const PILOT_REFUSED: readonly Call[] = [
  call("glob", { path: WORKSPACE, pattern: "**/*.ts" }),
  call("glob", { path: `${WORKSPACE}/src`, pattern: "*/x.ts" }),
  call("glob", { pattern: "**" }),
  call("grep", { path: WORKSPACE, pattern: "TODO" }),
  call("grep", { path: "src", pattern: "TODO", glob: "**/*.ts" }),
  call("count_pattern", { path: WORKSPACE, patterns: ["x"] }),
];

/** Folder reads outside a pilot's roots, or a literal path beside them. */
export const PILOT_ALLOWED: readonly Call[] = [
  call("glob", { path: `${WORKSPACE}/docs`, pattern: "**/*.md" }),
  call("grep", { path: "docs", pattern: "x", glob: "*.md" }),
  call("glob", { path: WORKSPACE, pattern: "README.md" }),
];

/** Reads from the root that a noise filter lets run. */
export const ROOT_READS: readonly Call[] = [
  call("glob", { path: WORKSPACE, pattern: "**/*.ts" }),
  call("grep", { path: WORKSPACE, pattern: "x" }),
];

/** The modes that run the reads only on a host without a gate. */
export const READ_ONLY_MODES: readonly string[] = ["plan", "dontAsk", "default", "unknown"];

/** Calls a host without a gate lets run in a mode. */
export const UNGATED_ALLOWED: ReadonlyArray<Call & { mode: string }> = [
  { ...call("file_write", { path: "a", content: "" }), mode: "acceptEdits" },
  { ...call("spawn_agent", {}), mode: "acceptEdits" },
  { ...call("shell_command", { command: "ls" }), mode: "bypassPermissions" },
];

/** Calls a host without a gate refuses in a mode. */
export const UNGATED_REFUSED: ReadonlyArray<Call & { mode: string }> = [
  { ...call("github", { action: "create_pr" }), mode: "acceptEdits" },
  { ...call("shell_command", { command: "git push" }), mode: "bypassPermissions" },
];

/** Facts that leave the mode to the gate. */
export const GATED_FACTS: readonly ActFacts[] = [
  { mode: "plan", gateEnabled: true },
  { mode: "plan", gateEnabled: undefined },
];

/** A registry of hooks: other events, junk and empty commands among them. */
export const HOOK_REGISTRY: readonly unknown[] = [
  { event: "stop", command: "x" }, { event: "pre-tool", command: " bash a.sh " }, null, { event: "post-tool", command: "" },
  { event: "post-tool", command: "bash b.sh" }, "junk", { event: "pre-tool" },
];

/** A pre-tool hook naming the event, the tool and the path. */
export const HOOK: ToolHook = { n: 1, event: "pre-tool", command: "bash h.sh {event} {tool} {path}" };

/** Calls and the command HOOK runs for them. */
export const HOOK_COMMANDS: ReadonlyArray<Call & { command: string }> = [
  { ...call("file_write", { path: "src/x.ts" }), command: "bash h.sh pre-tool file_write src/x.ts" },
  { ...call("file_write", { path: "a b; rm" }), command: "bash h.sh pre-tool file_write -" },
  { ...call("shell_command", { command: "ls" }), command: "bash h.sh pre-tool shell_command -" },
  { ...call("file_write", { path: "-rf" }), command: "bash h.sh pre-tool file_write -" },
];

/** Commands and the operator the shell tool refuses in them. */
export const OPERATORS: ReadonlyArray<[command: string, operator: string | undefined]> = [
  ["bash .orkeon/hooks/pre.sh {tool} {path}", undefined],
  ["echo x >> log", ">>"],
  ["a && b", "&&"],
  ["a; b", ";"],
  ["a | b", "|"],
];
