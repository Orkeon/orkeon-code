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
  // RAG (host wired since the hybrid-search work): rag_search reads; rag_ingest
  // writes to the MEMORY document store, never to disk — read-side by the same
  // reasoning as index_codebase. Names verified live (/debug-tool-call list,
  // 60 registered) — an act call whose agent names an unknown tool fails.
  "rag_search", "rag_ingest",
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
 *  - `delegate_work` / `spawn_agent` — NOT registered as IBaseTool anywhere.
 *    DelegateWorkTool is constructed per-agent by AgentDelegationToolsProvider and
 *    attached to that agent's own list; it never enters the DI catalogue the
 *    scripting bridge draws from. "Framework-registered and auto-bridged" holds
 *    for http_api, not for the A2A pair.
 */
export const NETWORK_READ_TOOLS = ["http_api", "web_scrape", "scrape_element"];

/** The built-in tools of each class a mode policy grants: each tool is named
 *  once, here or in the lists above, and every other list derives from this table. */
const TOOLS_BY_CLASS: Readonly<Record<ToolClass, readonly string[]>> = {
  read: READ_TOOLS,
  network: NETWORK_READ_TOOLS,
  edit: ["file_write"],
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

/**
 * Every built-in tool a rule may name; the configured extra tools come on top
 * (ruleableTool). The gate matches any name, so a rule on a tool the host does not
 * register would never match anything: naming it is refused instead.
 */
export const RULEABLE_TOOLS: readonly string[] = Object.values(TOOLS_BY_CLASS).flat();

/**
 * The arguments each built-in tool takes, as Orkeon binds them: the properties of
 * its request record in snake_case (ShellCommandRequest.WorkingDirectory →
 * `working_directory`), or the parameters it declares (rag_search, rag_ingest). The
 * gate reads a rule's argument by that exact name, so a rule on any other never
 * matches a call: /permissions refuses it.
 */
export const TOOL_ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
  file_read: ["path", "encoding", "max_length", "use_raggable_cache"],
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
  ],
  impact_analysis: ["target", "direction", "max_depth", "max_nodes"],
  package_summary: ["fqn", "include_public_exports", "include_dependencies", "max_exports"],
  sub_graph: ["seeds", "edge_kinds", "depth", "direction", "max_nodes", "include_mermaid"],
  symbol_detail: ["fqn", "expand", "include_signature", "include_doc", "include_body_metrics", "max_children"],
  rag_search: ["question", "top_k", "collection"],
  rag_ingest: ["collection", "sources", "chunking_strategy", "reindex"],
  http_api: ["url", "method", "headers", "body", "content_type"],
  web_scrape: ["url", "selector", "cached", "chunk_size"],
  scrape_element: ["url", "css_selector", "extract_attributes", "include_html", "max_elements"],
  file_write: ["path", "content", "encoding", "append", "create_backup"],
  shell_command: ["command", "working_directory", "timeout_seconds"],
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

/** Why an allow rule does nothing in `mode`, or undefined when it can spare a question there. */
function inertReason(mode: string, rule: PermissionRule, offered: readonly string[]): string | undefined {
  // The gate reads no allow rule in plan (ModePermissionGate): plan's promise of a
  // turn that changes nothing outranks the session's rules.
  if (mode === "plan") {
    return "mode 'plan' ignores every allow rule: the gate decides each call from the mode, which runs reads " +
      "and refuses the rest. Switch mode instead.";
  }
  if (!offered.includes(rule.tool)) {
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
  if (rule.argument === undefined) return { ok: true, rule };
  const known = TOOL_ARGUMENTS[tool];
  if (known === undefined) {
    return {
      ok: true,
      rule,
      warning: `the arguments of '${tool}' are not known here (its MCP server or plugin declares them): the rule ` +
        `matches a call only if '${tool}' takes an argument named exactly '${rule.argument}'.`,
    };
  }
  if (known.includes(rule.argument)) return { ok: true, rule };
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
