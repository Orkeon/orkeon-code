// Tool lists and expected mentions for the code-intel routing tests.

/** Every analysis tool the routing names: the main loop holds them all. */
export const ALL_ROUTED_TOOLS: readonly string[] = [
  "affected_tests", "codebase_map", "codebase_search", "count_pattern", "dependency_graph", "flow_trace", "grep",
  "impact_analysis", "package_summary", "structural_search", "sub_graph", "symbol_detail",
];

/** One tool given alone, and the call its line must spell out. */
export const SINGLE_TOOL_CASES: readonly { readonly tool: string; readonly mentions: readonly string[] }[] = [
  { tool: "codebase_map", mentions: ["`codebase_map`", "`L1_Package`"] },
  { tool: "package_summary", mentions: ["`package_summary(fqn)`"] },
  { tool: "codebase_search", mentions: ["`codebase_search(query)`", "`filter_kinds: [\"Class\"]`"] },
  { tool: "symbol_detail", mentions: ["expand: \"inheritance\"", "\"callers\""] },
  { tool: "sub_graph", mentions: ["direction: \"Backward\"", "edge_kinds: [\"inherits\"]", "[\"calls\"]"] },
  { tool: "flow_trace", mentions: ["`flow_trace(from, direction)`", "`Backward`"] },
  { tool: "impact_analysis", mentions: ["`impact_analysis(target)`"] },
  { tool: "affected_tests", mentions: ["`affected_tests(changed_files)`", "`base`"] },
  { tool: "dependency_graph", mentions: ["`dependency_graph`", "`L2_Module`"] },
  { tool: "structural_search", mentions: ["`structural_search`", "`language`", "`$NAME`", "`$$$NAME`"] },
  { tool: "count_pattern", mentions: ["`count_pattern`"] },
  { tool: "grep", mentions: ["`grep`", "`glob`", "output_mode"] },
];

/** The reviewer's and the auditor's lists hold part of the tools: their text names none of the others. */
export const PARTIAL_LISTS: readonly { readonly name: string; readonly tools: readonly string[] }[] = [
  {
    name: "the reviewer's tools",
    tools: [
      "file_read", "node_outline", "node_read", "directory_read", "codebase_search", "structural_search",
      "symbol_source", "symbol_detail", "impact_analysis",
    ],
  },
  { name: "the next batch reviewer's tools", tools: ["file_read", "node_outline", "node_read", "codebase_search"] },
  { name: "the auditor's tools", tools: ["file_read", "node_read", "codebase_search", "symbol_detail", "symbol_source"] },
];

/** The parameters the routing spells, per tool: the pinned contract must hold each one. */
export const ROUTED_PARAMS: readonly { readonly tool: string; readonly params: readonly string[] }[] = [
  { tool: "codebase_search", params: ["query", "filter_kinds"] },
  { tool: "flow_trace", params: ["from", "direction"] },
  { tool: "symbol_detail", params: ["fqn", "expand"] },
  { tool: "sub_graph", params: ["seeds", "direction", "edge_kinds"] },
  { tool: "impact_analysis", params: ["target"] },
  { tool: "package_summary", params: ["fqn"] },
  { tool: "codebase_map", params: ["level"] },
  { tool: "dependency_graph", params: ["scope"] },
];

/** Tools that give no analysis: no routing at all. */
export const NO_ANALYSIS_TOOLS: readonly string[] = ["file_read", "file_write", "shell_command"];
