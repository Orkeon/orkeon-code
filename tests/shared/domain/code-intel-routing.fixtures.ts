// Tool lists and expected mentions for the code-intel routing tests.
import { NEXT_BATCH_REVIEWER_CHARTER, REVIEWER_TOOLS } from "../../../src/shared/domain/dev/reviewer-charter.ts";
import { AUDITOR_TOOLS } from "../../../src/crews/dev-verify/domain/auditor-charter.ts";

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

/** The reviewer's and the auditor's lists, read from their charters, hold part of the tools: their text names none of
 *  the others. */
export const PARTIAL_LISTS: readonly { readonly name: string; readonly tools: readonly string[] }[] = [
  { name: "the reviewer's tools", tools: [...REVIEWER_TOOLS] },
  { name: "the next batch reviewer's tools", tools: [...NEXT_BATCH_REVIEWER_CHARTER.tools] },
  { name: "the auditor's tools", tools: [...AUDITOR_TOOLS] },
];

/** `root_fqn` narrows a cut result only for an agent holding a tool that takes it (codebase_map, dependency_graph). */
export const ROOT_FQN_CASES: readonly { readonly name: string; readonly tools: readonly string[]; readonly named: boolean }[] = [
  { name: "names root_fqn to an agent holding codebase_map", tools: ["codebase_map"], named: true },
  { name: "names root_fqn to an agent holding dependency_graph", tools: ["dependency_graph"], named: true },
  { name: "never names root_fqn to the reviewer", tools: [...REVIEWER_TOOLS], named: false },
  { name: "never names root_fqn to the auditor", tools: [...AUDITOR_TOOLS], named: false },
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

/** The parameters the routing spells for a tool outside the code-intel contract: the permission list pins them. */
export const PERMISSION_PINNED_PARAMS: readonly { readonly tool: string; readonly params: readonly string[] }[] = [
  { tool: "affected_tests", params: ["changed_files", "base"] },
];

/** Tools that give no analysis: no routing at all. */
export const NO_ANALYSIS_TOOLS: readonly string[] = ["file_read", "file_write", "shell_command"];

/** The preamble and the exhaustiveness rule speak of scripting only to an agent holding the shell. */
export const SHELL_WORDING_CASES: readonly {
  readonly name: string;
  readonly tools: readonly string[];
  readonly mentions: readonly string[];
  readonly omits: readonly string[];
}[] = [
  {
    name: "speaks of scripting in the preamble and the exhaustiveness rule to an agent holding the shell",
    tools: ["structural_search", "shell_command"],
    mentions: ["Ask the index before reading or scripting, by question:", "rather than writing a script over every file"],
    omits: [],
  },
  {
    name: "never speaks of scripting to an agent without the shell",
    tools: ["structural_search", "file_read"],
    mentions: ["Ask the index before reading, by question:", "to see the rest."],
    omits: ["script"],
  },
];
