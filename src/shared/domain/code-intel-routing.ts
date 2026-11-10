// Which code-intelligence tool answers which question: pure, no IO.
//
// An agent handed the analysis tools with no rule of use answers a structural question ("every base class",
// "who inherits X") the way it knows best: a shell script of regular expressions over the files, slower than the
// index and blind to what the index has already resolved. This module states, per question, the tool that answers
// it and the parameter that makes it answer (the edge kind, the direction, the expansion), and nothing about a tool
// the agent was not given: each line is emitted only when every tool it names is in the agent's list.
//
// Parameter names and values are Orkeon's wire names as its schemas publish them (snake_case; `inherits` stands for
// extends and implements on the graph tools and edge_list; `expand` takes the PascalCase flags, `Inheritance` giving a
// type's bases and what derives from it since Orkeon #280). code-intel-contract.ts pins the parameter names.

import {
  ASK_INDEX_BEFORE_READING, ASK_INDEX_BEFORE_SCRIPTING, CODE_INTEL_ROUTING_TEXT, truncatedIsASample,
} from "./prompts.ts";

/** One question and the tool that answers it: emitted when the agent holds every tool of `tools`. */
interface RoutingLine {
  readonly tools: readonly string[];
  readonly text: string;
}

const ROUTING_LINES: readonly RoutingLine[] = (Object.keys(CODE_INTEL_ROUTING_TEXT) as (keyof typeof CODE_INTEL_ROUTING_TEXT)[])
  .map((tool) => ({ tools: [tool], text: CODE_INTEL_ROUTING_TEXT[tool] }));

/** The analysis tools whose answer can be cut: an agent holding one gets the exhaustiveness rule. */
const BOUNDED_TOOLS: readonly string[] = [
  "codebase_map", "codebase_search", "dependency_graph", "grep", "structural_search", "sub_graph",
];

/** The analysis tools that take a `root_fqn`, the subtree they answer for: the rule names it only to their holder. */
const ROOT_FQN_TOOLS: readonly string[] = ["codebase_map", "dependency_graph", "edge_list"];

/** The agent's shell, the tool a script over the files would run in: the rules speak of scripting only to its holder. */
const SHELL_TOOL = "shell_command";

/** The exhaustiveness rule; `shell` adds the script it replaces, for an agent that could write one; `rootFqn` names
 *  the parameter that narrows to a subtree, for an agent holding a tool that takes it. */
function exhaustivenessRule(shell: boolean, rootFqn: boolean): string {
  const narrowers = ["one package", ...(rootFqn ? ["a `root_fqn`"] : []), "a `glob`"].join(", ");
  return truncatedIsASample(narrowers, shell);
}

/** The question-to-tool lines for an agent holding `tools`, one line each, then the exhaustiveness rule when it
 *  applies; empty when the agent holds none of the analysis tools. Scripting is named only to an agent holding the
 *  shell, `root_fqn` only to one holding a tool that takes it. */
export function describeCodeIntelRouting(tools: readonly string[]): string {
  const lines = ROUTING_LINES
    .filter((line) => line.tools.every((tool) => tools.includes(tool)))
    .map((line) => `- ${line.text}.`);
  if (lines.length === 0) return "";
  const bounded = BOUNDED_TOOLS.some((tool) => tools.includes(tool));
  const shell = tools.includes(SHELL_TOOL);
  const rootFqn = ROOT_FQN_TOOLS.some((tool) => tools.includes(tool));
  return [
    shell ? ASK_INDEX_BEFORE_SCRIPTING : ASK_INDEX_BEFORE_READING,
    ...lines,
    ...(bounded ? [exhaustivenessRule(shell, rootFqn)] : []),
  ].join("\n");
}
