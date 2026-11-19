// The main loop's explorer: the read-only agent a turn reaches through `spawn_agent` (docs/turn.md, "The explorer").
// The runtime's spawn_agent runs an agent the crew holds, by name, never the agent that calls it: the crew entry adds
// this one at each turn. Plan mode, the code's read and search tools, no shell, no write, no index build, no web.

import type { Charter } from "../../../shared/domain/agents/charter.ts";

export const EXPLORER_TOOLS: readonly string[] = [
  "file_read", "node_outline", "node_read", "directory_read", "glob", "grep", "codebase_map", "codebase_search",
  "structural_search", "symbol_source", "symbol_detail", "impact_analysis", "dependency_graph",
];

export const EXPLORER_CHARTER: Charter = {
  name: "explorer",
  role: "Read-only explorer",
  goal: "Survey the part of the project a brief names and report what it found, each fact with its path:line",
  mode: "plan",
  tools: EXPLORER_TOOLS,
  disallowed: ["shell_command", "file_write", "edit_file", "rag_ingest", "index_codebase"],
  maxIterations: 30,
};
