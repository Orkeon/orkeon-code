// The modes, rules, rule texts and commands the permission policy is tested on.
import { readFileSync } from "node:fs";

import { RULEABLE_TOOLS } from "./permission.ts";
import type { ExtraTool, PermissionRule, RuleCheck } from "./permission.ts";
import { WORKSPACE } from "../vfs.ts";

/** Each tool of `interface OrkeonBuiltInTools` (src/crews/.orkeon/orkeon.d.ts) with the depth-1 keys of
 *  its input: a ``/** `name` - …`` line, then `camel(input…{` and its keys until the brace closes, or
 *  `input?: Record<string, never>` for none. */
export function builtInToolInputs(): Map<string, string[]> {
  const text = readFileSync(new URL("../../../crews/.orkeon/orkeon.d.ts", import.meta.url), "utf8");
  const lines = text.slice(text.indexOf("interface OrkeonBuiltInTools {")).split("\n");
  const tools = new Map<string, string[]>();
  for (let i = 1; i < lines.length && lines[i] !== "}"; i++) {
    const name = /^\/\*\* `([a-z_0-9]+)` - /.exec(lines[i])?.[1];
    if (name === undefined) continue;
    const head = lines[++i];
    const keys: string[] = [];
    tools.set(name, keys);
    if (!/\(input\??: \{$/.test(head.trimEnd())) continue;
    for (let depth = 1; ++i < lines.length;) {
      const line = lines[i];
      if (depth === 1 && line.startsWith("}")) break;
      if (/^\s*(\/\*\*|\*)/.test(line)) continue;
      const key = /^\s*([a-z_0-9]+)\??:/.exec(line)?.[1];
      if (depth === 1 && key !== undefined) keys.push(key);
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    }
  }
  return tools;
}

// ── Modes ──

export const ALL_MODES: readonly string[] = ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"];
export const WRITING_MODES: readonly string[] = ["default", "acceptEdits", "bypassPermissions"];
export const READ_ONLY_MODES: readonly string[] = ["plan", "dontAsk"];

export const RESOLVE_MODE_CASES: readonly { name: string; raw: unknown; mode: string }[] = [
  { name: "defaults to 'default'", raw: undefined, mode: "default" },
  { name: "keeps a stored mode", raw: "plan", mode: "plan" },
];

export const READ_ONLY_TOOLSET_CASES: readonly { name: string; mode: string }[] = [
  { name: "plan mode is read-only (no write/shell)", mode: "plan" },
  { name: "dontAsk mode is read-only like plan (E-3)", mode: "dontAsk" },
];

export const READ_ONLY_CASES: readonly { mode: string; readOnly: boolean }[] = [
  { mode: "plan", readOnly: true },
  { mode: "dontAsk", readOnly: true },
  { mode: "default", readOnly: false },
  { mode: "acceptEdits", readOnly: false },
  { mode: "bypassPermissions", readOnly: false },
];

// The classification matrix, pinned per mode. A network read mutates nothing
// locally but reaches out, so it follows the write side, not the read side.
export const NETWORK_MATRIX: ReadonlyArray<[string, boolean]> = [
  ["default", true],
  ["acceptEdits", true],
  ["bypassPermissions", true],
  ["plan", false],
  ["dontAsk", false],
];

/** The A2A tools: DelegateWorkTool is built per-agent and never registered, so naming one would be a silent no-op. */
export const A2A_TOOLS: readonly string[] = ["delegate_work", "delegate_work_to_coworker", "search_tool"];

/** The reads of Orkeon #180, offered in every mode. */
export const ORKEON_180_READS: readonly string[] = [
  "glob", "grep", "list_mounts", "node_outline", "node_read", "count_pattern", "access_cost", "affected_tests",
  "batch_anchors", "documented_in", "documents_of", "structural_search", "incremental_reindex",
  "statement_query", "complexity_report",
];

/** The edit tools of Orkeon #180, offered only where the mode edits. */
export const ORKEON_180_EDITS: readonly string[] = [
  "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch", "structural_rewrite", "github",
  "rag_eval",
];

export const WRITE_TOOLS_IN_ORDER: readonly string[] = [
  "file_write", "rag_ingest", "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch",
  "structural_rewrite", "github", "rag_eval", "shell_command",
];

export const SCRIPT_TOOLS_DECLARED = [
  { name: "run_validation", access: "read" },
  { name: "run_tests", access: "execute" },
  { name: "run_build", access: "execute" },
  { name: "memory_recall", access: "read" },
  { name: "memory_push", access: "edit" },
];

export const SCRIPT_TOOL_ACCESS_CASES: readonly { name: string; tool: string; access: string | undefined }[] = [
  { name: "reads the access of a script tool case aside", tool: "RUN_TESTS", access: "execute" },
  { name: "gives no access to a built-in tool, which is no script tool", tool: "shell_command", access: undefined },
];

/** The arguments of a ruleable tool, as TOOL_ARGUMENTS pins them. */
export const TOOL_ARGUMENT_CASES: readonly { tool: string; args: readonly string[] }[] = [
  { tool: "run_validation", args: ["command"] },
  { tool: "run_build", args: ["project"] },
  { tool: "spawn_agent", args: ["agent", "input"] },
  { tool: "shell_command", args: ["command", "working_directory", "timeout_seconds", "action", "job_id", "tail_lines"] },
  { tool: "file_write", args: ["path", "content", "encoding", "append", "create_backup"] },
];

export interface ScriptToolsForCase {
  name: string;
  mode: string;
  tools: readonly string[];
  rules?: readonly PermissionRule[];
  expected: string[];
}

export const SCRIPT_TOOLS_FOR_CASES: readonly ScriptToolsForCase[] = [
  {
    name: "offer only the reading script tool in plan, and no built-in tool",
    mode: "plan", tools: ["run_tests", "run_validation", "file_read"], expected: ["run_validation"],
  },
  { name: "offer the executing script tools in default", mode: "default", tools: ["run_tests", "run_build"], expected: ["run_tests", "run_build"] },
  {
    name: "leave out a script tool a deny rule covers whole, case aside",
    mode: "acceptEdits", tools: ["memory_recall", "memory_push"], rules: [{ effect: "deny", tool: "MEMORY_PUSH" }],
    expected: ["memory_recall"],
  },
  {
    name: "leave out the recall a deny rule covers whole in plan",
    mode: "plan", tools: ["memory_recall", "memory_push"], rules: [{ effect: "deny", tool: "memory_recall" }], expected: [],
  },
  {
    name: "never leave out a script tool an argument pattern narrows",
    mode: "default", tools: ["memory_recall", "memory_push"],
    rules: [{ effect: "deny", tool: "memory_push", argument: "topic", pattern: "auth*" }],
    expected: ["memory_recall", "memory_push"],
  },
  {
    name: "never leave out a script tool an allow rule names",
    mode: "default", tools: ["memory_recall", "memory_push"], rules: [{ effect: "allow", tool: "memory_push" }],
    expected: ["memory_recall", "memory_push"],
  },
];

// ── Notes ──

/** What every writing mode's note says. */
export function writingNote(mode: string): string {
  return `(Permission mode: ${mode}. You may edit files, run shell commands and fetch over the network; ` +
    "the host may ask the user before a call.)";
}

// The catalogue is the enforcement; the note is what the model is told. The
// two drifting apart is how a model spends a turn planning a fetch it cannot make.
export const NOTE_NETWORK_CASES: readonly { mode: string; mention: string }[] = [
  { mode: "plan", mention: "fetch anything over the network" },
  { mode: "acceptEdits", mention: "fetch over the network" },
  { mode: "default", mention: "fetch over the network" },
];

// ── Rules ──

export const NPM_TEST: PermissionRule = { effect: "allow", tool: "shell_command", argument: "command", pattern: "npm test*" };
export const GIT_PUSH: PermissionRule = { effect: "deny", tool: "shell_command", argument: "command", pattern: "git push*" };
export const DENY_FILE_WRITE: PermissionRule = { effect: "deny", tool: "file_write" };

/** A whole-tool deny, an allow on a pattern, a deny on a pattern. */
export const ROUND_TRIP_RULES: readonly PermissionRule[] = [DENY_FILE_WRITE, NPM_TEST, GIT_PUSH];

/** Allows on file_read and file_write, the npm test allow, a deny on http_api. */
export const PLAN_RULES: readonly PermissionRule[] = [
  { effect: "allow", tool: "file_read" }, { effect: "allow", tool: "file_write" }, NPM_TEST,
  { effect: "deny", tool: "http_api" },
];

export const READER: ExtraTool = { name: "transcribe_audio", access: "read" };
export const WRITER: ExtraTool = { name: "search_issues", access: "write" };

/** A deny on the read extra tool, an allow on the write one. */
export const EXTRA_RULES: readonly PermissionRule[] = [
  { effect: "deny", tool: "transcribe_audio" }, { effect: "allow", tool: "search_issues" },
];

export const READ_RULE_CASES: readonly { name: string; text: unknown; rule: PermissionRule | null }[] = [
  { name: "reads `<effect> <tool>`", text: "deny file_write", rule: { effect: "deny", tool: "file_write" } },
  { name: "reads `<effect> <tool>` whatever its case and spaces", text: "  ALLOW   shell_command ", rule: { effect: "allow", tool: "shell_command" } },
  { name: "reads `<effect> <tool>`, any tool: the tool is checked apart", text: "deny nope", rule: { effect: "deny", tool: "nope" } },
  { name: "reads no rule from another effect", text: "maybe file_write", rule: null },
  { name: "reads no rule from an effect without a tool", text: "deny", rule: null },
  { name: "reads no rule from an empty text", text: "", rule: null },
  { name: "reads no rule from null", text: null, rule: null },
  { name: "reads an argument pattern, the rest of the text after `=`, spaces included", text: "allow shell_command command=npm test*", rule: NPM_TEST },
  { name: "reads an argument pattern of a deny", text: "deny shell_command command=git push*", rule: GIT_PUSH },
  {
    name: "reads an argument pattern up to its end, a second `=` included",
    text: `deny file_write path=${WORKSPACE}/a=b`,
    rule: { effect: "deny", tool: "file_write", argument: "path", pattern: `${WORKSPACE}/a=b` },
  },
  { name: "takes a pair of double quotes off the pattern", text: 'allow shell_command command="npm test*"', rule: NPM_TEST },
  { name: "takes a pair of single quotes off the pattern", text: "allow shell_command command='npm test*'", rule: NPM_TEST },
  { name: "reads no pattern from a quoted empty pattern", text: 'deny shell_command command=""', rule: null },
  { name: "refuses a scope without an argument name: a bare text", text: "allow shell_command npm test", rule: null },
  { name: "refuses a scope without an argument name", text: "allow shell_command =npm*", rule: null },
  { name: "refuses a scope without a pattern", text: "allow shell_command command=", rule: null },
  { name: "refuses an argument name with a space", text: "allow shell_command com mand=npm", rule: null },
  { name: "refuses an argument name that starts with a digit", text: "allow shell_command 1st=x", rule: null },
  { name: "reads the `effect:tool` form stored before rules took patterns", text: "deny:shell_command", rule: { effect: "deny", tool: "shell_command" } },
  { name: "reads the `effect:tool` form of an allow", text: "allow:http_api", rule: { effect: "allow", tool: "http_api" } },
  ...["", "deny", "deny:", ":file_write", "yolo:file_write", "deny:file_write:x", null, 7].map((junk) => ({
    name: `reads no rule from the stored junk ${JSON.stringify(junk)}`, text: junk, rule: null,
  })),
];

/** Texts whose pattern keeps what is left after one pair of matching quotes, and only one, is taken off. */
export const READ_PATTERN_CASES: readonly { text: string; pattern: string }[] = [
  { text: 'deny shell_command command=""x""', pattern: '"x"' },
  { text: "deny shell_command command=\"x'", pattern: "\"x'" },
  { text: 'deny shell_command command="', pattern: '"' },
  { text: 'deny shell_command command=a"b"', pattern: 'a"b"' },
];

/** Patterns that start and end with a quote: formatted, they are quoted once more. */
export const QUOTED_PATTERNS: readonly string[] = ['"x"', "'x'", '"', "''"];

export const FORMAT_CASES: readonly { rule: PermissionRule; text: string }[] = [
  { rule: DENY_FILE_WRITE, text: "deny file_write" },
  { rule: NPM_TEST, text: "allow shell_command command=npm test*" },
];

export const SAME_CALLS_CASES: readonly { name: string; a: PermissionRule; b: PermissionRule; same: boolean }[] = [
  { name: "an allow and a deny on the same pattern cover the same calls", a: NPM_TEST, b: { ...NPM_TEST, effect: "deny" }, same: true },
  { name: "tool names compare case aside", a: NPM_TEST, b: { ...NPM_TEST, tool: "Shell_Command" }, same: true },
  { name: "two patterns cover other calls", a: NPM_TEST, b: GIT_PUSH, same: false },
  { name: "a whole-tool rule and a scoped one cover other calls", a: { effect: "deny", tool: "shell_command" }, b: GIT_PUSH, same: false },
];

export const PARSE_STORED_CASES: readonly { name: string; raw: unknown; extras?: readonly string[]; rule: PermissionRule | null }[] = [
  { name: "reads the stored `effect:tool` form of a known tool", raw: "deny:shell_command", rule: { effect: "deny", tool: "shell_command" } },
  { name: "reads a rule on a known tool in that tool's spelling", raw: "allow SHELL_COMMAND command=npm test*", rule: NPM_TEST },
  ...["deny nope", "deny:nope", "", "deny", "yolo:file_write", null, 7].map((junk) => ({
    name: `reads no rule from the unknown tool or corrupted entry ${JSON.stringify(junk)}`, raw: junk, rule: null,
  })),
  { name: "reads no rule on an extra tool without the configured names", raw: "deny search_issues", rule: null },
  {
    name: "reads a stored rule on a tool the configured names hold",
    raw: "deny search_issues query=secret*", extras: ["search_issues"],
    rule: { effect: "deny", tool: "search_issues", argument: "query", pattern: "secret*" },
  },
  {
    name: "reads the stored `effect:tool` form of a configured tool",
    raw: "allow:search_issues", extras: ["search_issues"], rule: { effect: "allow", tool: "search_issues" },
  },
  {
    name: "reads a configured tool in the configured spelling",
    raw: "deny Get-File-Contents", extras: ["get-file-contents"], rule: { effect: "deny", tool: "get-file-contents" },
  },
  { name: "reads no stored `effect:tool` form on an extra tool without the configured names", raw: "allow:search_issues", rule: null },
];

export const RULE_SYNTAX_REASON = "expected <deny|allow> <tool> [<argument>=<pattern>]";

const SPAWN_WARNING = "'spawn_agent' is offered to every act whatever the mode: an allow rule lets it run without " +
  "asking in dontAsk too.";

export const CHECK_RULE_CASES: readonly { name: string; text: string; extras?: readonly string[]; check: RuleCheck }[] = [
  {
    name: "takes a rule on the shared memory's push, on an argument of its schema",
    text: "deny memory_push topic=auth*",
    check: { ok: true, rule: { effect: "deny", tool: "memory_push", argument: "topic", pattern: "auth*" } },
  },
  {
    name: "takes a rule on one of Orkeon Code's own tools, on the argument it takes",
    text: "deny run_tests command=dotnet test*",
    check: { ok: true, rule: { effect: "deny", tool: "run_tests", argument: "command", pattern: "dotnet test*" } },
  },
  {
    name: "warns on an allow rule on spawn_agent, which runs without asking in dontAsk too",
    text: "allow spawn_agent", check: { ok: true, rule: { effect: "allow", tool: "spawn_agent" }, warning: SPAWN_WARNING },
  },
  {
    name: "warns on an argument-scoped allow rule on spawn_agent, read in its own spelling",
    text: "allow Spawn_Agent agent=researcher",
    check: { ok: true, rule: { effect: "allow", tool: "spawn_agent", argument: "agent", pattern: "researcher" }, warning: SPAWN_WARNING },
  },
  {
    name: "refuses nothing on spawn_agent, and warns on no deny",
    text: "deny spawn_agent", check: { ok: true, rule: { effect: "deny", tool: "spawn_agent" } },
  },
  {
    name: "accepts a rule on a built-in tool covering every call",
    text: "deny file_write", check: { ok: true, rule: { effect: "deny", tool: "file_write" } },
  },
  {
    name: "accepts a rule on an argument a built-in tool takes, in the tool's own spelling",
    text: "allow Shell_Command command=npm test*", check: { ok: true, rule: NPM_TEST },
  },
  {
    name: "accepts a rule with a quoted pattern",
    text: 'allow shell_command command="npm test*"', check: { ok: true, rule: NPM_TEST },
  },
  {
    name: "refuses an argument a built-in tool does not take, naming the ones it does",
    text: "allow shell_command cmd=npm test*",
    check: {
      ok: false, reason: "'shell_command' has no argument 'cmd': it takes command, working_directory, timeout_seconds, action, job_id, tail_lines",
    },
  },
  {
    name: "refuses an argument in another case than the one the tool takes",
    text: "deny shell_command Command=rm*",
    check: {
      ok: false, reason: "'shell_command' has no argument 'Command': it takes command, working_directory, timeout_seconds, action, job_id, tail_lines",
    },
  },
  {
    name: "refuses an argument on a tool that takes none",
    text: "deny index_status path=x",
    check: { ok: false, reason: "'index_status' takes no argument: a rule on it covers every call" },
  },
  {
    name: "accepts a whole-tool rule on an extra tool, without a warning",
    text: "deny search_issues", extras: ["search_issues"], check: { ok: true, rule: { effect: "deny", tool: "search_issues" } },
  },
  { name: "refuses a text that is not the grammar", text: "permit file_read", check: { ok: false, reason: RULE_SYNTAX_REASON } },
  { name: "refuses a scope without a pattern", text: "allow shell_command command=", check: { ok: false, reason: RULE_SYNTAX_REASON } },
  {
    name: "refuses a tool that is neither built in nor configured, naming the ones a rule may name",
    text: "deny nope", extras: ["search_issues"],
    check: { ok: false, reason: `'nope' is no tool a rule may name: one of ${[...RULEABLE_TOOLS, "search_issues"].join(", ")}` },
  },
];

/** Texts checkRule accepts or refuses, its verdict only. */
export const CHECK_RULE_OK_CASES: readonly { name: string; text: string; ok: boolean }[] = [
  { name: "takes a rule on the shared memory's recall, on its query", text: "deny memory_recall query=x", ok: true },
  { name: "refuses a rule on the shared memory's recall, on an argument its schema lacks", text: "deny memory_recall path=x", ok: false },
  { name: "refuses a rule on run_build, on an argument it does not take", text: "deny run_build command=x", ok: false },
  { name: "accepts a rule on a path a built-in tool takes", text: `deny file_write path=${WORKSPACE}/secrets/*`, ok: true },
];

export const RULEABLE_TOOL_CASES: readonly { name: string; tool: string; extras?: readonly string[]; spelled: string | undefined }[] = [
  { name: "names a built-in tool in its own spelling, case aside", tool: "FILE_WRITE", spelled: "file_write" },
  { name: "names a configured tool in its own spelling, case aside", tool: "listissues", extras: ["listIssues"], spelled: "listIssues" },
  { name: "names no tool for another spelling than case", tool: "list_issues", extras: ["listIssues"], spelled: undefined },
];

// ── Shell commands and patterns ──

export const SHELL_WORDS_CASES: readonly { command: string; words: string[] }[] = [
  { command: 'git  "push"\t\'origin main\'', words: ["git", "push", "origin main"] },
  { command: 'a"b c"d', words: ["ab cd"] },
  { command: "   ", words: [] },
];

export const SHELL_FORMS_CASES: readonly { command: string; forms: string[] }[] = [
  { command: "git status", forms: ["git status"] },
  { command: 'git "push"', forms: ['git "push"', "git push"] },
  { command: "git pu\\sh", forms: ["git pu\\sh", "git push"] },
  { command: "python3 -Ic x", forms: ["python3 -Ic x", "python3 -I -c x"] },
  { command: "ls --all -1", forms: ["ls --all -1"] },
  { command: 'python3 -Ic"print(1)"', forms: ['python3 -Ic"print(1)"', "python3 -Icprint(1)", "python3 -I -c print(1)"] },
  { command: "perl -wE'say 1'", forms: ["perl -wE'say 1'", "perl -wEsay 1", "perl -w -E say 1"] },
  { command: "ls -la", forms: ["ls -la", "ls -l -a"] },
];

export const GLOB_CASES: readonly { name: string; pattern: string; text: string; matches: boolean }[] = [
  { name: "matches a pattern whole, `*` standing for an empty run", pattern: "git push*", text: "git push", matches: true },
  { name: "matches a pattern whole, `*` standing for any run", pattern: "git push*", text: "git push origin main", matches: true },
  { name: "matches a pattern without `*` whole only", pattern: "git push", text: "git push --force", matches: false },
  { name: "matches a pattern from the start of the text only", pattern: "git push*", text: "xgit push", matches: false },
  { name: "lets `*` stand for a run of line breaks", pattern: "*BEGIN*", text: "a\nBEGIN\nb", matches: true },
  { name: "matches `*` alone with an empty text", pattern: "*", text: "", matches: true },
  { name: "reads every other character literally", pattern: "a.b(c)*", text: "a.b(c)d", matches: true },
  { name: "reads a dot literally", pattern: "a.b(c)*", text: "axb(c)d", matches: false },
  { name: "counts the case", pattern: "Git push*", text: "git push", matches: false },
  { name: "reads `?` literally", pattern: "a?c", text: "abc", matches: false },
];

export const MATCHES_RULE_CASES: readonly { name: string; rule: string; tool: string; args: Record<string, unknown>; matches: boolean }[] = [
  {
    name: "covers a call by the tool, case aside", rule: "deny shell_command command=git push*",
    tool: "Shell_Command", args: { command: "git push" }, matches: true,
  },
  {
    name: "covers a call by the argument named exactly", rule: "deny shell_command command=git push*",
    tool: "shell_command", args: { Command: "git push" }, matches: false,
  },
  {
    name: "covers no call of another tool", rule: "deny shell_command command=git push*",
    tool: "file_write", args: { command: "git push" }, matches: false,
  },
  { name: "covers every call when the rule names no argument", rule: "deny file_write", tool: "file_write", args: {}, matches: true },
  { name: "matches nothing when the argument is absent", rule: "deny file_read path=*", tool: "file_read", args: {}, matches: false },
  { name: "matches nothing when the argument is null", rule: "deny file_read path=*", tool: "file_read", args: { path: null }, matches: false },
  { name: "matches nothing when the argument is a list", rule: "deny file_read path=*", tool: "file_read", args: { path: ["a"] }, matches: false },
  { name: "matches nothing when the argument is an object", rule: "deny file_read path=*", tool: "file_read", args: { path: { a: 1 } }, matches: false },
  {
    name: "reads a number as its text", rule: "deny shell_command timeout_seconds=600",
    tool: "shell_command", args: { timeout_seconds: 600 }, matches: true,
  },
  { name: "reads a boolean as its text", rule: "deny file_write append=true", tool: "file_write", args: { append: true }, matches: true },
];

/** An allow on every git command, then a deny on git push. */
export const GIT_RULE_TEXTS: readonly string[] = ["allow shell_command command=git *", "deny shell_command command=git push*"];

export const DECISION_CASES: readonly { name: string; command: string; decision: "deny" | "allow" | undefined }[] = [
  { name: "lets a deny win over an allow on the same call", command: "git push", decision: "deny" },
  { name: "lets an allow decide a call no deny covers", command: "git status", decision: "allow" },
  { name: "leaves a call no rule covers to the mode", command: "npm test", decision: undefined },
];
