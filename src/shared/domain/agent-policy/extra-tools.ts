// The `tools.extra` setting — pure, no IO: the tools the host registers beyond
// Orkeon Code's built-in lists (an MCP server's under Orkeon's `MCP:Servers`, a
// plugin's) that the main agent may use, each with the access class that decides
// which modes offer it (mode-policy.ts). The notation:
//
//   transcribe_audio:read, search_issues, create_issue:write
//
// entries separated by commas or spaces, each `<name>` or `<name>:<read|write>`.
// A name without a class is a write: the read-only modes do not offer it unless
// the user says it only reads. The host's permission gate still decides each
// call from the access the tool declares to Orkeon.

import { builtInTool, sameToolName } from "./permission.ts";
import type { ExtraTool } from "./permission.ts";

/** The /config key that lists them. */
export const EXTRA_TOOLS_CONFIG_KEY = "tools.extra";

/** What an entry must be, for messages. */
export const EXTRA_TOOL_ENTRY_RULE = "each entry is <name>[:read|:write], a tool that is not built in, named once";

/** A tool name as the host registers it: letters, digits, `_`, `-`, `.`. */
const TOOL_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export interface ExtraToolsParse {
  /** The valid entries, in the order given. */
  tools: ExtraTool[];
  /** Entries left out, as written: not the notation, a built-in tool (its class is
   *  Orkeon Code's), or a name given again. */
  invalid: string[];
}

/**
 * Parses the setting, or the list the crew receives (one entry per item). Never
 * throws: what does not parse is returned in `invalid` for the caller to report.
 */
export function parseExtraTools(value: unknown): ExtraToolsParse {
  const entries = Array.isArray(value)
    ? value.map((e) => String(e ?? "").trim())
    : String(value ?? "").split(/[\s,]+/);
  const tools: ExtraTool[] = [];
  const invalid: string[] = [];
  for (const entry of entries.filter((e) => e.length > 0)) {
    const colon = entry.indexOf(":");
    const name = colon < 0 ? entry : entry.slice(0, colon);
    const access = colon < 0 ? "write" : entry.slice(colon + 1);
    // Orkeon compares tool names case-insensitively: `File_Read` is the built-in
    // `file_read`, and `Search_Issues` names `search_issues` again.
    const valid = TOOL_NAME.test(name) && (access === "read" || access === "write")
      && builtInTool(name) === undefined && !tools.some((t) => sameToolName(t.name, name));
    if (valid) tools.push({ name, access: access as ExtraTool["access"] });
    else invalid.push(entry);
  }
  return { tools, invalid };
}

/** One entry in the notation, class always written: `search_issues:write`. */
export function formatExtraTool(tool: ExtraTool): string {
  return `${tool.name}:${tool.access}`;
}

/** Why a value of the setting is refused, or undefined when every entry parses. */
export function extraToolsProblem(value: string): string | undefined {
  const { tools, invalid } = parseExtraTools(value);
  if (invalid.length > 0) {
    return `${EXTRA_TOOL_ENTRY_RULE}; not: ${invalid.join(", ")}`;
  }
  return tools.length === 0 ? "it names no tool" : undefined;
}
