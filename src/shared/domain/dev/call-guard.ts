// What a dev crew's onToolCall checks after the host's gate allowed a call, and the /hooks declarations it runs
// around the call — pure, no IO. The host gate runs first and keeps the session's rules; this guard can only
// refuse: the step's rule sets again (the only check of them under `orkeon run`, which keeps no session rules), the
// role's roots and its rewrite rule, the whole input of the folder readers, each operation of an edit_batch as the
// editor it stands for, and the act's mode when the host has no gate. The callbacks
// themselves, and the hooks' shell commands, are shared/application/dev/tool-callbacks.ts's.
import { ACT_TOOLS, READ_TOOLS, formatRule, matchesRule, sameToolName, shellCommandForms } from "../agent-policy/permission.ts";
import type { PermissionRule } from "../agent-policy/permission.ts";
import {
  GIT_CONFIG_SET_RULE, OPERATION_TOOLS, OPERATIONS_TOOL, PATH_WRITE_TOOLS, RULE_SETS, UNSCOPED_WRITE_TOOLS, gitConfigSets,
} from "../agent-policy/rule-sets.ts";
import type { RuleSetId } from "../agent-policy/rule-sets.ts";
import { STEP_RULE_SETS, roleRules } from "./step-rules.ts";
import type { DevRole, DevStep, LayoutRootKey } from "./step-rules.ts";
import type { RepoPackLayout } from "./repo-pack.ts";
import { matchesAny, relativePath } from "./test-paths.ts";
import { EDIT_BATCH_SHAPE } from "./reading-rule.ts";
import { WORKSPACE } from "../vfs.ts";

/** One /hooks declaration the callbacks run; `n` is its number in /hooks list. */
export interface ToolHook { n: number; event: "pre-tool" | "post-tool"; command: string }

/** What a crew builds its guard from: its step, and for a role of a batch the role and the pack's roots. */
export interface CallGuardSpec {
  step: DevStep;
  role?: DevRole;
  layout?: Pick<RepoPackLayout, LayoutRootKey | "testFiles">;
  /** Exact paths the test author's own root denies leave writable (the signature stubs a RED step names): no
   *  pattern, no other role, never a rule set's deny, never the host's gate: nothing widens. */
  writable?: readonly string[];
  /** The crew's `hooks` input: the /hooks registry as the command read it. */
  hooks?: unknown;
  /** Tools beyond READ_TOOLS that only read (a crew's autonomous tools declared `read`): let through by every
   *  mode when the host has no gate. */
  readTools?: readonly string[];
}

/** A deny rule of the guard and where it comes from: a step's set, a role's roots, or a writing role's rewrite rule
 *  (no whole write of an existing source file, step-rules.ts roleRules). */
export interface GuardRule {
  rule: PermissionRule;
  origin: { kind: "set"; id: RuleSetId } | { kind: "role"; role: DevRole; access: "read" | "write" } | { kind: "rewrite"; role: DevRole };
}

export interface CallGuard {
  step: DevStep;
  role?: DevRole;
  rules: GuardRule[];
  /** Why a root of the role got no rule, and the pack keys it lacks. */
  problems: string[];
  hooks: ToolHook[];
  readTools: readonly string[];
  /** What the role's write denies leave open: the pack's test file patterns, for the test author only. */
  writable: readonly string[];
  /** The exact paths the test author's write denies leave open: its stubs, compared as paths, never as patterns. */
  stubs: readonly string[];
}

export type CallVerdict = { allow: true } | { allow: false; reason: string; context: string };

const ALLOW: CallVerdict = { allow: true };

export function buildCallGuard(spec: CallGuardSpec): CallGuard {
  const rules: GuardRule[] = [];
  for (const id of STEP_RULE_SETS[spec.step]) {
    for (const rule of RULE_SETS[id].rules) {
      if (rule.effect === "deny") rules.push({ rule, origin: { kind: "set", id } });
    }
  }
  const problems: string[] = [];
  const writable: string[] = [];
  const stubs: string[] = [];
  if (spec.role !== undefined) {
    const role = spec.role;
    const access = role === "pilot" ? "read" : "write";
    const own = roleRules(role, spec.layout ?? {});
    for (const rule of own.rules) rules.push({ rule, origin: { kind: "role", role, access } });
    for (const rule of own.rewrite) rules.push({ rule, origin: { kind: "rewrite", role } });
    problems.push(...own.problems, ...own.missing.map((key) => `the pack gives no ${key}: no rule on it`));
    if (access === "write") writable.push(...own.writable);
    if (role === "test-author") stubs.push(...(spec.writable ?? []).map(relativePath).filter((p) => p !== ""));
  }
  return {
    step: spec.step, role: spec.role, rules, problems, hooks: toolHooks(spec.hooks), readTools: spec.readTools ?? [], writable, stubs,
  };
}

/** The pre-tool and post-tool declarations of a raw registry, numbered by their place in it; a malformed entry,
 *  another event or an empty command is skipped (it keeps its number). */
export function toolHooks(raw: unknown): ToolHook[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolHook[] = [];
  raw.forEach((entry, i) => {
    const event = (entry as { event?: unknown } | null)?.event;
    const command = (entry as { command?: unknown } | null)?.command;
    if ((event === "pre-tool" || event === "post-tool") && typeof command === "string" && command.trim() !== "") {
      out.push({ n: i + 1, event, command: command.trim() });
    }
  });
  return out;
}

/** The operators the host's shell tool refuses in a command (ShellCommandTool's forbidden list): a hook is one
 *  program and its arguments. */
export const SHELL_OPERATORS: readonly string[] = [";", "&&", "||", "|", "$(", "`", "\n", "\r", "&", "<", ">>", ">"];

/** The first operator of `command` the shell tool would refuse, or undefined. */
export function shellOperatorIn(command: string): string | undefined {
  return SHELL_OPERATORS.find((op) => command.includes(op));
}

/** A path the hook may receive as one word: letters, digits and `._/@+=,:-`. */
const PLAIN = /^[A-Za-z0-9._/@+=,:-]+$/;

/** The hook's command with `{tool}`, `{event}` and `{path}` replaced: `{path}` is the input's `path` when it is
 *  plain and does not start with `-` (never read as an option by the hook), else `-`. */
export function hookCommand(hook: ToolHook, tool: string, input: unknown): string {
  const raw = (input as { path?: unknown } | null)?.path;
  const path = typeof raw === "string" && PLAIN.test(raw) && !raw.startsWith("-") ? raw : "-";
  const name = PLAIN.test(tool) ? tool : "-";
  return hook.command.replaceAll("{tool}", name).replaceAll("{event}", hook.event).replaceAll("{path}", path);
}

/** The tools `acceptEdits` runs without asking beside the reads: the file editors, rag_ingest and spawn_agent.
 *  `github` and `rag_eval` declare no access, so the host asks them there too. */
const ACCEPT_EDITS_TOOLS: readonly string[] = [...PATH_WRITE_TOOLS, OPERATIONS_TOOL, ...UNSCOPED_WRITE_TOOLS, "rag_ingest", ...ACT_TOOLS];

/** What the act's mode lets through when the host has no gate, by the gate's own reading of the classes. */
function modeVerdict(guard: CallGuard, tool: string, mode: string): CallVerdict {
  if (mode === "bypassPermissions") return ALLOW;
  const reads = [...READ_TOOLS, ...guard.readTools];
  const allowed = mode === "acceptEdits" ? [...reads, ...ACCEPT_EDITS_TOOLS] : reads;
  if (allowed.includes(tool)) return ALLOW;
  const known = ["default", "acceptEdits", "plan", "dontAsk"].includes(mode) ? mode : "default";
  return {
    allow: false,
    reason: `${guard.step}: '${tool}' is not run in mode '${known}': the host has no permission gate, so the crew's ` +
      `callback applies the mode itself`,
    context: known === "acceptEdits"
      ? "Use the read tools and the file editors only."
      : "Use the read tools only.",
  };
}

function plainText(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** A path with its `//` collapsed and its `.` and `..` segments resolved by their text: `/workspace/./src//x`
 *  and `/workspace/tests/../src/x` read `/workspace/src/x`, `./src/x` reads `src/x`. A `..` that climbs above the
 *  path's start is kept. */
export function normalisePath(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else if (part === ".." && absolute) continue;
    else out.push(part);
  }
  const text = out.join("/");
  return absolute ? `/${text}` : text === "" ? "." : text;
}

/** The forms a path is matched in: as written, normalised, and for a relative path the absolute one the host
 *  resolves it to under the project, where a leading `..` cannot climb above the root
 *  (`../workspace/tests/a.test.ts` reads `/workspace/tests/a.test.ts`). Each form once. */
function pathForms(path: string): string[] {
  const forms = [path, normalisePath(path)];
  if (!path.startsWith("/")) forms.push(normalisePath(`${WORKSPACE}/${path}`));
  return [...new Set(forms)];
}

function joinPath(base: string | undefined, tail: string): string {
  if (base === undefined) return tail;
  const head = base.endsWith("/") ? base.slice(0, -1) : base;
  return tail.startsWith("/") ? tail : `${head}/${tail}`;
}

/** The paths a folder reader reaches beyond its `path`: glob's pattern under it, grep's glob under it (or the
 *  whole folder), count_pattern's and directory_search's whole folder. */
function reachedPaths(tool: string, input: Readonly<Record<string, unknown>>): string[] {
  const base = plainText(input.path);
  if (tool === "glob") {
    const pattern = plainText(input.pattern);
    return pattern === undefined ? [] : [joinPath(base, pattern)];
  }
  if (tool === "grep") return [joinPath(base, plainText(input.glob) ?? "**")];
  if (tool === "count_pattern" || tool === "directory_search") return [joinPath(base, "**")];
  return [];
}

/** The text of `path` up to its first wildcard of a glob (`*`, `?`, `[`, `{`). */
function literalHead(path: string): string {
  const at = path.search(/[*?[{]/);
  return at < 0 ? path : path.slice(0, at);
}

/** Whether a joined path with a wildcard whose literal head starts the rule's folder can reach below it
 *  (`/workspace/**` and `/workspace/s*` reach `/workspace/src/*`). The rule's pattern is `<root>/*`. */
function reachesBelow(rule: PermissionRule, joined: string): boolean {
  const pattern = rule.pattern ?? "";
  if (!pattern.endsWith("/*") || pattern.slice(0, -2).includes("*")) return false;
  const folder = pattern.slice(0, -1);
  const head = literalHead(joined);
  return head !== joined && folder.startsWith(head);
}

function originText(origin: GuardRule["origin"]): string {
  if (origin.kind === "set") return `the rule set ${origin.id}`;
  return origin.kind === "rewrite" ? `the ${origin.role}'s rewrite rule` : `the ${origin.role}'s roots`;
}

function contextOf(guard: CallGuard, origin: GuardRule["origin"]): string {
  if (origin.kind === "set") return `${RULE_SETS[origin.id].title} are refused during /${guard.step}: do without this call.`;
  if (origin.kind === "rewrite") {
    return "This source file exists: change it by node (node_read for its sha256, then node_replace, node_insert or " +
      "node_ensure) or with edit_file, never by writing it whole; file_write only creates a file.";
  }
  return origin.access === "read"
    ? `The ${origin.role} opens no source or test file by its path: work from the batch sheet and the plan.`
    : `The ${origin.role} writes outside these roots only: ${origin.role === "implementer" ? "leave the tests as they are" : "write the tests, no source file"}.`;
}

function ruleVerdict(guard: CallGuard, entry: GuardRule, how: string): CallVerdict {
  return {
    allow: false,
    reason: `${guard.step}: refused by '${formatRule(entry.rule)}' of ${originText(entry.origin)}${how}`,
    context: contextOf(guard, entry.origin),
  };
}

/**
 * One call, after the host's gate allowed it: refused when the host has no gate and the act's mode does not let
 * it through, when a deny rule of the guard covers its input, or when it reaches below a covered folder through
 * a pattern of a folder reader; otherwise allowed. Allow rules are never read: the guard cannot widen the gate.
 * The hooks are not run here (the callbacks run them after an allow).
 */
export function checkToolCall(
  guard: CallGuard, tool: string, input: unknown, act: ActFacts,
): CallVerdict {
  if (act.gateEnabled === false) {
    const verdict = modeVerdict(guard, tool, act.mode);
    if (!verdict.allow) return verdict;
  }
  const args = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Readonly<Record<string, unknown>>
    : {};
  const given = typeof args.path === "string" ? pathForms(args.path) : [undefined];
  for (const path of given) {
    const asked = path === undefined || path === args.path ? args : { ...args, path };
    for (const entry of guard.rules) {
      if (leftWritable(guard, entry, path) || (entry.origin.kind === "rewrite" && act.newFile === true)) continue;
      if (matchesRule(entry.rule, tool, asked)) return ruleVerdict(guard, entry, path === args.path ? "" : `, which '${path}' is`);
    }
  }
  // The command as the program receives it: a pattern on the raw text misses `git "push"` or `python3 -Ic`.
  const command = sameToolName(tool, "shell_command") && typeof args.command === "string" ? args.command : undefined;
  for (const form of command === undefined ? [] : shellCommandForms(command).slice(1)) {
    for (const entry of guard.rules) {
      if (matchesRule(entry.rule, tool, { ...args, command: form })) return ruleVerdict(guard, entry, `, which '${form}' runs`);
    }
  }
  // A git config that sets a value, which no glob of git-readonly can tell from a read (rule-sets gitConfigSets).
  if (command !== undefined && gitConfigSets(command)) {
    const held = guard.rules.find((e) => e.origin.kind === "set" && e.origin.id === "git-readonly");
    if (held !== undefined) return ruleVerdict(guard, { rule: GIT_CONFIG_SET_RULE, origin: held.origin }, "");
  }
  const reached = reachedPaths(tool, args).flatMap(pathForms);
  for (const joined of reached) {
    for (const entry of guard.rules) {
      if (entry.rule.argument !== "path" || leftWritable(guard, entry, joined)) continue;
      if (matchesRule(entry.rule, tool, { ...args, path: joined })) {
        return ruleVerdict(guard, entry, `, which '${joined}' reaches`);
      }
      if (entry.origin.kind === "role" && entry.origin.access === "read" && sameToolName(entry.rule.tool, tool)
        && reachesBelow(entry.rule, joined)) {
        return ruleVerdict(guard, entry, `, which '${joined}' can reach`);
      }
    }
  }
  return sameToolName(tool, OPERATIONS_TOOL) ? checkOperations(guard, args, act) : ALLOW;
}

/** What the act's callbacks tell the guard of one call: the act's mode, the host's gate, and for a file_write
 *  whether its path names no file yet (read by the callbacks; undefined when not known, and the rewrite rule holds). */
export interface ActFacts { mode: string; gateEnabled: boolean | undefined; newFile?: boolean }

const BATCH_SHAPE = `Give ${EDIT_BATCH_SHAPE}.`;

function batchRefusal(guard: CallGuard, why: string, context = BATCH_SHAPE): CallVerdict {
  return { allow: false, reason: `${guard.step}: edit_batch refused: ${why}`, context };
}

/** An edit_batch, operation by operation: each is checked as the editor its `kind` stands for (OPERATION_TOOLS), with
 *  its own path and text, so every rule of the guard holds on it; the first refusal refuses the whole batch. A batch
 *  whose operations cannot be read is refused, and so is `validate: "build"`, the tool's own build rather than the
 *  pack's (run_build). An operation never creates a file: the rewrite rule's lift does not apply. */
function checkOperations(guard: CallGuard, args: Readonly<Record<string, unknown>>, act: ActFacts): CallVerdict {
  const validate = args.validate;
  if (validate !== undefined && validate !== null && String(validate).trim().toLowerCase() !== "parse") {
    return batchRefusal(guard, `validate '${String(validate)}' is not run in a dev step`,
      "Use validate \"parse\" (the default); the build is run_build's, with the pack's command.");
  }
  const operations = args.operations;
  if (!Array.isArray(operations) || operations.length === 0) return batchRefusal(guard, "no list of operations");
  for (const [i, raw] of operations.entries()) {
    const op = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Readonly<Record<string, unknown>> : null;
    const kind = typeof op?.kind === "string" ? op.kind.trim() : "";
    const editor = Object.entries(OPERATION_TOOLS).find(([k]) => sameToolName(k, kind))?.[1];
    if (op === null || typeof op.path !== "string" || op.path.trim() === "") {
      return batchRefusal(guard, `operation ${i + 1} names no path`);
    }
    if (editor === undefined) return batchRefusal(guard, `operation ${i + 1} has the unknown kind '${kind}'`);
    const verdict = checkToolCall(guard, editor, op, { mode: act.mode, gateEnabled: act.gateEnabled });
    if (!verdict.allow) {
      return { allow: false, reason: `${verdict.reason} (edit_batch operation ${i + 1}, ${kind} on '${op.path}')`, context: verdict.context };
    }
  }
  return ALLOW;
}

/** A role's own write deny does not hold on a path its guard leaves writable. */
function leftWritable(guard: CallGuard, entry: GuardRule, path: string | undefined): boolean {
  return path !== undefined && entry.origin.kind === "role" && entry.origin.access === "write"
    && entry.rule.argument === "path"
    && (matchesAny(path, guard.writable) || guard.stubs.includes(relativePath(path)));
}

/** The refusal the model reads: the reason, then the line saying what to do instead. */
export function denyText(verdict: Extract<CallVerdict, { allow: false }>): string {
  return `${verdict.reason}\n${verdict.context}`;
}
