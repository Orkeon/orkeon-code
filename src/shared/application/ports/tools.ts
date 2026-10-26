// The tool ports: the host's registered tools, a tool call read as text, and the permission gate's session rules.
// Types only, re-exported by ../ports.ts.

import type { PermissionRule } from "../../domain/agent-policy/permission.ts";

/** One tool call read as text: the tool's text, or its own failure message, the
 *  runtime's wrapping gone. */
export type ToolOutcome = { ok: true; text: string } | { ok: false; failure: string };

/** The tools the host registers, by the names it registers them under (`file_read`,
 *  an MCP server's `get-file-contents` or `listIssues`): a diagnostic view and the
 *  check of the extra tools, apart from the catalogue a mode hands the model
 *  (shared/domain/agent-policy). Orkeon matches a tool name case-insensitively (an
 *  agent's `.tools([...])`, the gate's rules), and so does `find`. */
export interface ToolCatalogue {
  /** Every registered name, as registered, sorted. */
  names(): string[];
  /** The registered name `name` designates, compared case-insensitively; undefined
   *  when the host registers no such tool. */
  find(name: string): string | undefined;
  /** Call the tool `name` designates with `args` as given; resolves to its raw
   *  result, throws its failure, or that no registered tool answers to `name`. */
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** The same call, decoded: the result as text, or the tool's own failure message
   *  (that no registered tool answers to `name` included). Never throws. */
  callText(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
}

/** The session rules of the host's permission gate, which it reads at every tool
 *  call before the mode: a deny refuses a matching call in every mode, an allow
 *  lets it run without asking in every mode but `plan`. The host keeps them until
 *  it exits, and removes them only all at once. */
export interface PermissionRules {
  /** Whether the host keeps session rules (orkeon-repl does). When it does not,
   *  the gate decides from the mode alone and every other call throws. */
  available(): boolean;
  /** Whether the host's gate is on (`Orkeon:Security:PermissionGate:Enabled`): false, no rule
   *  and no mode is enforced; undefined when the host keeps no session rules. */
  enabled(): boolean | undefined;
  /** Put a rule in force; a rule already in force is kept once. */
  add(rule: PermissionRule): void;
  /** Remove every rule. */
  clear(): void;
  /** The rules in force, one line each: `allow shell_command command=npm test*`. */
  list(): string[];
}
