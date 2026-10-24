// The main loop's TOOL CATALOGUE and the session's permission rules — pure, no
// IO. Which tool classes a mode offers is the table of mode-policy.ts; this
// module names the tools of each class, adds the extra tools the user configured
// (extra-tools.ts), builds the catalogue, and parses and formats the rules that
// /permissions keeps and the host's permission gate enforces. `plan` and
// `dontAsk` offer no mutating tool, so no write or shell call can even be
// attempted in them.

import { policyFor } from "./mode-policy.ts";
import type { ToolClass } from "./mode-policy.ts";

/** Read-side tools (inspection + the read-only RaggableTree index queries). */
export const READ_TOOLS = [
  "file_read", "directory_read", "directory_search",
  // index_codebase builds a derived graph+cache (no source mutation) so it
  // stays read-side; the rest query it.
  "index_codebase", "index_status",
  "codebase_map", "codebase_search", "symbol_source", "flow_trace",
  // The analysis five (all ToolAccess.Read, probed live 2026-08-06, 14/14):
  // without them the model reconstructs a dependency view one flow_trace at a
  // time — dependency_graph/impact_analysis answer it in one call.
  "dependency_graph", "impact_analysis", "package_summary", "sub_graph", "symbol_detail",
  // RAG (host wired since the hybrid-search work): rag_search reads. rag_ingest is
  // an EDIT (the class below): it writes the knowledge index, never the workspace,
  // and the host gate classifies it so since Orkeon #126 — refused in plan and
  // dontAsk, asked in default — so a read-only turn must not be offered it. Names
  // verified live (/debug-tool-call list, 60 registered) — an act call whose agent
  // names an unknown tool fails.
  "rag_search",
  // Since Orkeon #180 (each declares ToolAccess.Read): files, mounts, the node readers and the graph queries.
  "glob", "grep", "list_mounts", "node_outline", "node_read", "count_pattern",
  "access_cost", "affected_tests", "batch_anchors", "documented_in", "documents_of",
  "structural_search", "incremental_reindex", "statement_query", "complexity_report",
];

/**
 * B-8 — network-read tools: they mutate nothing locally, but they reach OUT.
 *
 * Every name here was verified against the running host (`Object.keys(tools)` in
 * the REPL, 57 registered tools) rather than against the DI source, because
 * `.tools([...])` resolves by name: a name the host does not register fails the
 * agent's act call (UnknownToolError) before the model is asked anything.
 *
 * Two tools the backlog expected are deliberately absent, and their absence is
 * pinned by a test rather than left to be rediscovered:
 *  - `search_tool` — the registered names are `web_search` (needs
 *    AddOrkeonWebSearchTool) and `semantic_search` (needs AddSemanticSearchTool);
 *    the REPL host (Orkeon.ConsoleApp) calls neither, so no search tool exists to
 *    hand over.
 *  - `delegate_work` — NOT registered as IBaseTool anywhere. DelegateWorkTool is
 *    constructed per-agent by AgentDelegationToolsProvider and attached to that
 *    agent's own list; it never enters the DI catalogue the scripting bridge draws
 *    from. "Framework-registered and auto-bridged" holds for http_api, not for it.
 *
 * `spawn_agent` is the script host's own tool, appended to every act whatever
 * `.tools([...])` names (naming it there fails the act): it is ruleable
 * (ACT_TOOLS) and never named in a catalogue.
 */
export const NETWORK_READ_TOOLS = ["http_api", "web_scrape", "scrape_element"];

/** The built-in tools of each class a mode policy grants: each tool is named
 *  once, here or in the lists above, and every other list derives from this table. */
const TOOLS_BY_CLASS: Readonly<Record<ToolClass, readonly string[]>> = {
  read: READ_TOOLS,
  network: NETWORK_READ_TOOLS,
  edit: [
    "file_write", "rag_ingest",
    "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch", "structural_rewrite",
    "github", "rag_eval",
  ],
  shell: ["shell_command"],
  extra: [],
};

/** Mutating tools — added for every mode except the read-only ones. */
export const WRITE_TOOLS: readonly string[] = [...TOOLS_BY_CLASS.edit, ...TOOLS_BY_CLASS.shell];

/** What an extra tool may do, as the user declares it in `tools.extra`. */
export type ExtraToolAccess = "read" | "write";

/** A tool the host registers beyond the built-in lists (an MCP server's, a plugin's). */
export interface ExtraTool {
  name: string;
  access: ExtraToolAccess;
}

/** The class an extra tool joins: a `read` one is offered with the local reads,
 *  a `write` one only by the modes whose policy grants `extra`. */
const EXTRA_TOOL_CLASS: Readonly<Record<ExtraToolAccess, ToolClass>> = { read: "read", write: "extra" };

/** Normalise the raw permissionMode input to a string (default "default"). */
export function resolvePermissionMode(raw: any): string {
  return String(raw ?? "default");
}

/** `plan` inspects only; `dontAsk` denies writes without asking (E-3). */
export function isReadOnly(mode: string): boolean {
  return policyFor(mode).readOnly;
}

/**
 * The tool catalogue for a mode: the tools of the classes its policy grants, in
 * order, each class's built-in tools then the extra tools that join it.
 */
export function toolsetFor(mode: string, extras: readonly ExtraTool[] = []): string[] {
  return policyFor(mode).toolClasses.flatMap((c) => [
    ...TOOLS_BY_CLASS[c],
    ...extras.filter((t) => EXTRA_TOOL_CLASS[t.access] === c).map((t) => t.name),
  ]);
}

/** The permission clause appended to the act() prompt. */
export function permissionNote(mode: string): string {
  const clause = isReadOnly(mode)
    ? "Read-only: read and search the project, but MUST NOT modify files, run commands or fetch anything over the " +
      "network; answer with an assessment or a plan."
    : "You may edit files, run shell commands and fetch over the network; the host may ask the user before a call.";
  return `(Permission mode: ${mode}. ${clause})`;
}

/** The full prompt handed to ctx.llm.act: the user request + permission note. */
export function buildActPrompt(prompt: string, mode: string): string {
  return `${prompt}\n\n${permissionNote(mode)}`;
}

// ── The session's rules: enforced by the host gate, read by the catalogue ──
//
// The host's permission gate (Orkeon's ModePermissionGate) reads the session's
// rules before the mode, at every tool call of the model (act; a command's own
// `tools.*` call is not checked): a deny rule refuses a matching call
// in every mode; an allow rule lets it run without asking in every mode but
// `plan`. A rule covers every call of a tool, or the calls whose argument matches
// a pattern whole, `*` standing for any run of characters. /permissions keeps the
// rules in the session state bag and hands them to the gate
// (shared/application/permission-rules.ts).
//
// The catalogue reads one kind of rule only: a deny that covers EVERY call of a
// tool removes the tool, so the model is not offered a tool whose every call the
// gate would refuse. An argument-scoped deny leaves the tool offered (its other
// calls run), and an allow spares a question, it never hands over a tool the mode
// does not offer: the read-only promise of `plan` and `dontAsk` rests on that.

export type RuleEffect = "deny" | "allow";

export interface PermissionRule {
  effect: RuleEffect;
  /** Tool name, e.g. "shell_command". */
  tool: string;
  /** The argument the pattern is read against, e.g. "command"; absent, the rule
   *  covers every call of the tool. Set together with `pattern`. */
  argument?: string;
  /** The text the argument must match whole, `*` for any run of characters, e.g. "npm test*". */
  pattern?: string;
}

/** Tools the host offers to every act whatever `.tools([...])` names (naming one there fails the act):
 *  ruleable, never in a catalogue. */
export const ACT_TOOLS: readonly string[] = ["spawn_agent"];

/** The access a tool Orkeon Code defines declares to the gate (`toolBuilder().access`): `read` runs in every
 *  mode, `execute` is gated as a write (refused in plan and dontAsk, asked in default and acceptEdits). */
export type ScriptToolAccess = "read" | "edit" | "execute";

/**
 * The tools Orkeon Code defines itself (shared/infrastructure/orkeon/script-tools.ts), attached to an agent with
 * `withAutonomousTool`, never named in `.tools([...])`: the gate reads their declared access, and a session rule
 * matches them by name like a built-in, so they are ruleable and in no catalogue. Their own shell calls are not
 * gated by the host: each applies the rules it is given (matchesRule) before it runs one.
 */
export const SCRIPT_TOOLS: ReadonlyArray<{ name: string; access: ScriptToolAccess }> = [
  { name: "run_validation", access: "read" },
  { name: "run_tests", access: "execute" },
  { name: "run_build", access: "execute" },
  // The shared memory's (M-5): the recall reads, the push writes a candidate file (an edit).
  { name: "memory_recall", access: "read" },
  { name: "memory_push", access: "edit" },
];

/** The shared memory's tools, offered to the main loop by mode (scriptToolsFor). */
export const MEMORY_TOOLS: readonly string[] = ["memory_recall", "memory_push"];

/** The tool class whose grant lets a script tool of this access be offered (mode-policy.ts toolClasses). */
const SCRIPT_TOOL_CLASS: Readonly<Record<ScriptToolAccess, ToolClass>> = { read: "read", edit: "edit", execute: "shell" };

/**
 * Which of `names` (script tools a crew builds) the mode offers under the session's rules: those whose declared
 * access the mode's policy grants (`read` always, `edit` with the edit class, `execute` with the shell class), less
 * those a deny rule covers whole. A name that is no script tool is left out. The gate still checks every call.
 */
export function scriptToolsFor(mode: string, names: readonly string[], rules: readonly PermissionRule[] = []): string[] {
  const classes = policyFor(mode).toolClasses;
  const denied = rules.filter((r) => r.effect === "deny" && coversEveryCall(r)).map((r) => r.tool);
  return names.filter((name) => {
    const access = scriptToolAccess(name);
    return access !== undefined && classes.includes(SCRIPT_TOOL_CLASS[access]) && !denied.some((t) => sameToolName(t, name));
  });
}

/** The access `name` declares, when it is one of SCRIPT_TOOLS; undefined otherwise. */
export function scriptToolAccess(name: string): ScriptToolAccess | undefined {
  return SCRIPT_TOOLS.find((tool) => tool.name.toLowerCase() === name.toLowerCase())?.access;
}

/**
 * Every built-in tool a rule may name, and Orkeon Code's own (SCRIPT_TOOLS); the configured extra tools come on top
 * (ruleableTool). The gate matches any name, so a rule on a tool the host does not
 * register would never match anything: naming it is refused instead.
 */
export const RULEABLE_TOOLS: readonly string[] = [
  ...Object.values(TOOLS_BY_CLASS).flat(), ...ACT_TOOLS, ...SCRIPT_TOOLS.map((tool) => tool.name),
];

/**
 * The arguments each built-in tool takes, as Orkeon binds them: the properties of
 * its request record in snake_case (ShellCommandRequest.WorkingDirectory →
 * `working_directory`), or the parameters it declares (rag_search, rag_ingest). The
 * gate reads a rule's argument by that exact name, so a rule on any other never
 * matches a call: /permissions refuses it.
 */
export const TOOL_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  file_read: ["path", "encoding", "max_length", "use_raggable_cache", "offset", "limit"],
  directory_read: ["path", "recursive", "pattern", "max_results"],
  directory_search: [
    "path", "query", "file_patterns", "recursive", "top_k", "threshold", "chunk_size", "max_file_size_kb",
  ],
  index_codebase: [
    "root_path", "languages", "exclude", "enrich_with_llm", "embedding_model", "root_alias", "respect_gitignore",
  ],
  index_status: [],
  codebase_map: ["level", "include_metrics", "root_fqn", "max_entries"],
  codebase_search: [
    "query", "levels", "top_k", "filter_kinds", "filter_packages", "filter_languages", "min_score",
    "include_signature", "mode",
  ],
  symbol_source: ["fqn", "mode", "max_lines", "statement_id"],
  flow_trace: ["from", "to", "direction", "max_depth", "edge_kinds", "include_all_paths", "max_paths"],
  dependency_graph: [
    "scope", "edge_kinds", "include_external", "root_fqn", "max_nodes", "include_mermaid", "include_dot",
    "node_kinds",
  ],
  impact_analysis: ["target", "direction", "max_depth", "max_nodes"],
  package_summary: ["fqn", "include_public_exports", "include_dependencies", "max_exports"],
  sub_graph: ["seeds", "edge_kinds", "depth", "direction", "max_nodes", "include_mermaid", "node_kinds"],
  symbol_detail: ["fqn", "expand", "include_signature", "include_doc", "include_body_metrics", "max_children"],
  rag_search: ["question", "top_k", "collection"],
  rag_ingest: ["collection", "sources", "chunking_strategy", "reindex", "prune"],
  http_api: ["url", "method", "headers", "body", "content_type"],
  web_scrape: ["url", "selector", "cached", "chunk_size"],
  scrape_element: ["url", "css_selector", "extract_attributes", "include_html", "max_elements"],
  file_write: ["path", "content", "encoding", "append", "create_backup"],
  shell_command: ["command", "working_directory", "timeout_seconds", "action", "job_id", "tail_lines"],
  // The tools of Orkeon #180, each with the depth-1 keys of its input (orkeon.d.ts, OrkeonBuiltInTools).
  // Nested arguments, which no rule reaches (the gate reads a top-level argument's text, and an array or
  // an object reads as its type name):
  //  - edit_batch.operations[]: expected_hash?, index?, kind, level?, module?, name?, path, position?,
  //    selector, text; `kind` names the operation (node_replace, node_insert, ensure_*, the Markdown
  //    intents) where node_ensure takes `op`; `expected_hash` (node_read's sha256) is required on a
  //    node_replace operation as on node_replace itself; `validate` is "parse" (default) or "build".
  //  - structural_rewrite is a dry run unless `dry_run` is false; `rule` is an object, `paths` an array.
  //  - github, per action: list_issues {owner, repo}, create_issue {owner, repo, title, body?},
  //    create_pr {owner, repo, base, head, title, body?}, get_pr {owner, repo, number}, search_repos
  //    {query}, get_repo {owner, repo}; the tool reads the action case-insensitively, a rule does not.
  //  - batch_anchors.a and .b are {fqns, files}, for action "overlap"; "closure" takes fqns or files.
  //  - arrays or objects: rag_ingest.sources, access_cost.*, affected_tests.changed_files,
  //    sub_graph.seeds|edge_kinds|node_kinds, structural_search.paths|rule, count_pattern.patterns,
  //    statement_query.kinds|parent_fqns, incremental_reindex.changed_files|languages.
  glob: ["max_results", "path", "pattern"],
  grep: ["case_insensitive", "glob", "max_files", "max_results", "path", "pattern"],
  list_mounts: [],
  node_outline: ["path"],
  node_read: ["path", "selector"],
  access_cost: ["changed_files", "fqns", "receivers", "roots"],
  affected_tests: ["base", "changed_files"],
  batch_anchors: ["a", "action", "b", "files", "fqns"],
  documented_in: ["fqn"],
  documents_of: ["path"],
  structural_search: ["glob", "language", "max_files", "max_results", "paths", "pattern", "rule", "rule_file"],
  incremental_reindex: ["changed_files", "enrich_with_llm", "from_commit", "languages", "root_path", "to_commit"],
  count_pattern: ["distinct_matches", "include_matches", "max_matches_returned", "multiline", "path", "patterns"],
  statement_query: ["kinds", "parent_fqns", "semantic_query", "top_k"],
  complexity_report: ["metric", "root_fqn", "top_n"],
  edit_file: ["create_backup", "new_string", "old_string", "path", "replace_all"],
  node_replace: ["expected_hash", "path", "selector", "text"],
  node_insert: ["path", "position", "selector", "text"],
  node_ensure: ["index", "level", "module", "name", "op", "path", "selector", "text"],
  edit_batch: ["operations", "validate"],
  structural_rewrite: ["dry_run", "fix", "glob", "language", "max_files", "paths", "pattern", "rule", "rule_file"],
  github: ["action", "base", "body", "head", "number", "owner", "query", "repo", "title"],
  rag_eval: ["collection", "compare", "dataset", "k", "profile", "reindex", "use_llm_judge"],
  // Offered by the script host to every act, not a built-in of orkeon.d.ts (SpawnAgentScriptRequest).
  spawn_agent: ["agent", "input"],
  // Orkeon Code's own tools (SCRIPT_TOOLS), the keys of their schemas.
  run_validation: ["command"],
  run_tests: ["command"],
  run_build: ["project"],
  memory_recall: ["query", "types", "top_k"],
  memory_push: [
    "type", "title", "topic", "applies_when", "rationale", "correction", "detection_signal", "evidence", "tags",
  ],
};

/** Whether two tool names designate the same tool: Orkeon compares them case-insensitively. */
export function sameToolName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The built-in tool `name` designates, in its own spelling; undefined when it is none. */
export function builtInTool(name: string): string | undefined {
  return RULEABLE_TOOLS.find((tool) => sameToolName(tool, name));
}

/** The tool a rule's name designates, a built-in one or one of `extraNames` (the
 *  configured extra tools), in its own spelling; undefined when it is neither. */
export function ruleableTool(name: string, extraNames: readonly string[] = []): string | undefined {
  return builtInTool(name) ?? extraNames.find((tool) => sameToolName(tool, name));
}

export interface CatalogueDecision {
  /** The effective catalogue after the rules. */
  tools: string[];
  /** Tools the mode offers and a whole-tool deny rule removed. */
  deniedByRule: string[];
  /** Allow rules that cannot take effect in this mode, with the reason — never silently dropped. */
  inert: Array<{ rule: PermissionRule; reason: string }>;
}

/** True when the rule covers every call of its tool, not only the calls an argument pattern matches. */
export function coversEveryCall(rule: PermissionRule): boolean {
  return rule.argument === undefined;
}

/** Whether a deny rule covers every call of `tool` (an agent offered it would be refused at each call). */
export function deniesEveryCall(rules: readonly PermissionRule[], tool: string): boolean {
  return rules.some((r) => r.effect === "deny" && coversEveryCall(r) && sameToolName(r.tool, tool));
}

/** Whether the host offers `tool` to every act (ACT_TOOLS), whatever the catalogue. */
function isActTool(tool: string): boolean {
  return ACT_TOOLS.some((name) => sameToolName(name, tool));
}

/** Why an allow rule does nothing in `mode`, or undefined when it can spare a question there. */
function inertReason(mode: string, rule: PermissionRule, offered: readonly string[]): string | undefined {
  // The gate reads no allow rule in plan (ModePermissionGate): plan's promise of a
  // turn that changes nothing outranks the session's rules.
  if (mode === "plan") {
    return "mode 'plan' ignores every allow rule: the gate decides each call from the mode, which runs reads " +
      "and refuses the rest. Switch mode instead.";
  }
  // An ACT_TOOLS tool reaches the gate from every act whatever the catalogue: the gate reads an allow
  // rule on it in every other mode, dontAsk included.
  if (!offered.includes(rule.tool) && !isActTool(rule.tool)) {
    return `mode '${mode}' does not offer '${rule.tool}': an allow rule spares a question, ` +
      "it does not hand a tool over. Switch mode instead.";
  }
  return undefined;
}

/**
 * The catalogue of a mode under the session's rules: the tools the mode offers,
 * the extra tools of the classes it grants included, less those a deny rule
 * covers whole. The rules themselves are the gate's to
 * enforce; this only spares the model a tool it could never call.
 *
 * An allow rule is reported as inert in `plan`, where the gate ignores every allow,
 * and wherever the mode does not offer its tool: no call of the tool can reach the gate.
 */
export function catalogueFor(
  mode: string,
  rules: readonly PermissionRule[],
  extras: readonly ExtraTool[] = [],
): CatalogueDecision {
  const offered = toolsetFor(mode, extras);
  const denied = new Set(rules.filter((r) => r.effect === "deny" && coversEveryCall(r)).map((r) => r.tool));
  const inert = rules
    .filter((r) => r.effect === "allow")
    .flatMap((rule) => {
      const reason = inertReason(mode, rule, offered);
      return reason === undefined ? [] : [{ rule, reason }];
    });
  return {
    tools: offered.filter((t) => !denied.has(t)),
    deniedByRule: offered.filter((t) => denied.has(t)),
    inert,
  };
}

/** An argument name as tools declare them (`command`, `path`). */
const ARGUMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What a rule must look like, for messages. */
export const RULE_SYNTAX = "<deny|allow> <tool> [<argument>=<pattern>]";

/** The pattern without one pair of matching quotes around it: `"npm test*"` → `npm test*`. */
function unquote(pattern: string): string {
  const quote = pattern.charAt(0);
  return pattern.length >= 2 && (quote === '"' || quote === "'") && pattern.endsWith(quote)
    ? pattern.slice(1, -1)
    : pattern;
}

/** Whether the pattern starts and ends with the same quote, which reading it would take off. */
function looksQuoted(pattern: string): boolean {
  return unquote(pattern) !== pattern;
}

/**
 * Reads a rule's text by the grammar alone, `<deny|allow> <tool> [<argument>=<pattern>]`
 * (the /permissions grammar, the stored form, the line the host gate lists, e.g.
 * `allow shell_command command=npm test*`), or the `effect:tool` form stored before
 * rules took patterns. The pattern is the rest of the text after `=`, spaces
 * included, less one pair of matching quotes around it (`command="npm test*"`).
 * The tool is not checked: a stored rule may name a tool the session no longer
 * knows, and is still that rule. Null when the text is not the grammar.
 */
export function readRule(text: unknown): PermissionRule | null {
  const trimmed = String(text ?? "").trim();
  const legacy = /^([^:\s]+):([^:\s]+)$/.exec(trimmed);
  const m = /^(\S+)\s+(\S+)(?:\s+(.+))?$/.exec(legacy ? `${legacy[1]} ${legacy[2]}` : trimmed);
  if (!m) return null;
  const effect = m[1].toLowerCase();
  const tool = m[2];
  if (effect !== "deny" && effect !== "allow") return null;
  if (m[3] === undefined) return { effect, tool };
  const eq = m[3].indexOf("=");
  const argument = m[3].slice(0, Math.max(eq, 0));
  const pattern = unquote(m[3].slice(eq + 1));
  if (eq < 0 || !ARGUMENT_NAME.test(argument) || pattern.length === 0) return null;
  return { effect, tool, argument, pattern };
}

/**
 * A stored rule, as the session holds it: the rule its text reads as, its tool in
 * the spelling of the built-in or configured extra tool it designates. Null when
 * the text is not a rule or its tool is neither: such a rule is kept as written
 * (shared/application/permission-rules.ts), never enforced.
 */
export function parseStoredRule(raw: unknown, extraNames: readonly string[] = []): PermissionRule | null {
  const rule = readRule(raw);
  const tool = rule === null ? undefined : ruleableTool(rule.tool, extraNames);
  return rule === null || tool === undefined ? null : { ...rule, tool };
}

/** A rule /permissions may add, with what to say about it, or why it may not. */
export type RuleCheck =
  | { ok: true; rule: PermissionRule; warning?: string }
  | { ok: false; reason: string };

/**
 * Checks a rule to add: the grammar (readRule); a tool built in or among
 * `extraNames`, taken in its own spelling; and, for a built-in tool, an argument it
 * takes (TOOL_ARGUMENTS). The arguments of an extra tool are not known here: one is
 * accepted with a warning.
 */
export function checkRule(text: unknown, extraNames: readonly string[] = []): RuleCheck {
  const read = readRule(text);
  if (read === null) return { ok: false, reason: `expected ${RULE_SYNTAX}` };
  const tool = ruleableTool(read.tool, extraNames);
  if (tool === undefined) {
    const tools = [...RULEABLE_TOOLS, ...extraNames].join(", ");
    return { ok: false, reason: `'${read.tool}' is no tool a rule may name: one of ${tools}` };
  }
  const rule = { ...read, tool };
  // The gate reads an allow rule on an ACT_TOOLS tool in every mode but plan: say so, refuse nothing.
  const accepted: RuleCheck = rule.effect === "allow" && isActTool(tool)
    ? {
      ok: true,
      rule,
      warning: `'${tool}' is offered to every act whatever the mode: an allow rule lets it run without asking in ` +
        "dontAsk too.",
    }
    : { ok: true, rule };
  if (rule.argument === undefined) return accepted;
  const known = TOOL_ARGUMENTS[tool];
  if (known === undefined) {
    return {
      ok: true,
      rule,
      warning: `the arguments of '${tool}' are not known here (its MCP server or plugin declares them): the rule ` +
        `matches a call only if '${tool}' takes an argument named exactly '${rule.argument}'.`,
    };
  }
  if (known.includes(rule.argument)) return accepted;
  return {
    ok: false,
    reason: known.length === 0
      ? `'${tool}' takes no argument: a rule on it covers every call`
      : `'${tool}' has no argument '${rule.argument}': it takes ${known.join(", ")}`,
  };
}

/** The rule as one line, as stored and shown: the host gate's spelling
 *  (gateLine), with a pattern that starts and ends with the same quote quoted
 *  once more, so that the line reads back as this rule. */
export function formatRule(rule: PermissionRule): string {
  if (coversEveryCall(rule) || !looksQuoted(rule.pattern ?? "")) return gateLine(rule);
  return `${rule.effect} ${rule.tool} ${rule.argument}="${rule.pattern}"`;
}

/** The rule as the host gate lists it: `deny file_write`, `allow shell_command command=npm test*`. */
export function gateLine(rule: PermissionRule): string {
  const head = `${rule.effect} ${rule.tool}`;
  return coversEveryCall(rule) ? head : `${head} ${rule.argument}=${rule.pattern}`;
}

/** Whether two rules cover the same calls (same tool, same argument and pattern), whatever their effect. */
export function sameCalls(a: PermissionRule, b: PermissionRule): boolean {
  return sameToolName(a.tool, b.tool) && a.argument === b.argument && a.pattern === b.pattern;
}

/**
 * Whether `text` matches `pattern` whole, as the host gate reads a rule's pattern: `*` stands for any run of
 * characters (none, or many, line breaks included); every other character stands for itself, case counting.
 * No other wildcard exists: `?`, `[`, `.`, `(` are literal.
 */
export function globMatches(pattern: string, text: string): boolean {
  const parts = pattern.split("*");
  if (parts.length === 1) return pattern === text;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (text.length < first.length + last.length) return false;
  if (!text.startsWith(first) || !text.endsWith(last)) return false;
  // The middle parts, in order and without overlap, between the first part and the last.
  const end = text.length - last.length;
  let at = first.length;
  for (const part of parts.slice(1, -1)) {
    const found = text.indexOf(part, at);
    if (found < 0 || found + part.length > end) return false;
    at = found + part.length;
  }
  return true;
}

/**
 * Whether `rule` covers this call, by the gate's own reading (docs/permissions.md, "Rules"): the tool by
 * sameToolName; a rule without argument covers every call; otherwise the argument named exactly
 * `rule.argument` (own property of `args`) must be present and its text match `rule.pattern` whole.
 * A string argument is its text; a number or a boolean its String(); anything else (absent, null, object,
 * array) matches nothing. The effect is not read: this says "covered", not "refused".
 * It mirrors the gate and is NOT the gate: the gate enforces the session's rules on the model's calls;
 * this function serves the tests and the tools Orkeon Code wraps around built-ins (W1), whose own
 * calls the gate does not see.
 */
export function matchesRule(rule: PermissionRule, tool: string, args: Readonly<Record<string, unknown>>): boolean {
  if (!sameToolName(rule.tool, tool)) return false;
  if (coversEveryCall(rule)) return true;
  const name = rule.argument as string;
  if (!Object.prototype.hasOwnProperty.call(args, name)) return false;
  const value = args[name];
  const text = typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
  return text !== undefined && globMatches(rule.pattern ?? "", text);
}

/** The words of a shell command as the host's shell tool splits them (ShellCommandTool.TokenizeCommand): on
 *  whitespace outside quotes, the quotes themselves dropped, nothing expanded. */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let single = false;
  let double = false;
  for (const c of command) {
    if (c === "'" && !double) { single = !single; continue; }
    if (c === "\"" && !single) { double = !double; continue; }
    if (/\s/.test(c) && !single && !double) {
      if (current !== "") words.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  if (current !== "") words.push(current);
  return words;
}

/**
 * A cluster of short options read as separate flags: `-Ic` as `-I -c`, `-we` as `-w -e`; code attached to the
 * cluster after its first `c`, `e` or `E` stands apart (`-Icprint(1)` read `-I -c print(1)`). A long option, or a
 * word that is not a cluster, is kept whole.
 */
function splitCluster(word: string): string[] {
  const match = /^-([A-Za-z]+)(.*)$/s.exec(word);
  if (match === null) return [word];
  const [, letters, rest] = match;
  const at = letters.search(/[ceE]/);
  if (at < 0) return rest === "" && letters.length > 1 ? [...letters].map((letter) => `-${letter}`) : [word];
  const flags = [...letters.slice(0, at + 1)].map((letter) => `-${letter}`);
  const tail = letters.slice(at + 1) + rest;
  return tail === "" ? flags : [...flags, tail];
}

/**
 * The texts a shell command is matched in by a deny rule: as written, then as the program receives it, which a
 * pattern on the raw text misses. The words rejoined by one space (`git "push"`, `git<TAB>push`, `bash  -c`); the
 * same with each backslash escape resolved, as `/bin/sh` reads it under a sandbox (`git pu\sh`); and with each
 * cluster of short options split (`python3 -Ic x` read `python3 -I -c x`, `perl -we"p 1"` read `perl -w -e p 1`), so the
 * patterns on a flag before `-c` or `-e` hold. Each form once, the raw one first.
 */
export function shellCommandForms(command: string): string[] {
  const words = shellWords(command);
  const unescaped = words.map((w) => w.replace(/\\(.)/g, "$1"));
  const split = unescaped.flatMap(splitCluster);
  return [...new Set([command, words.join(" "), unescaped.join(" "), split.join(" ")])];
}

/** What `rules` decide for this call: "deny" when a deny rule covers it (deny wins in every mode),
 *  else "allow" when an allow rule does, else undefined (the mode decides). */
export function ruleDecision(
  rules: readonly PermissionRule[], tool: string, args: Readonly<Record<string, unknown>>,
): RuleEffect | undefined {
  const covering = rules.filter((rule) => matchesRule(rule, tool, args));
  if (covering.some((rule) => rule.effect === "deny")) return "deny";
  return covering.length > 0 ? "allow" : undefined;
}
