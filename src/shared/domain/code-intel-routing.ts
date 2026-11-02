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

/** One question and the tool that answers it: emitted when the agent holds every tool of `tools`. */
interface RoutingLine {
  readonly tools: readonly string[];
  readonly text: string;
}

const ROUTING_LINES: readonly RoutingLine[] = [
  {
    tools: ["codebase_map"],
    text: "the repository's shape: `codebase_map` (level `L1_Package` first)",
  },
  {
    tools: ["package_summary"],
    text: "what one package holds and exposes: `package_summary(fqn)`",
  },
  {
    tools: ["codebase_search"],
    text: "a symbol by name or meaning: `codebase_search(query)`, `filter_kinds: [\"Class\"]` for one kind",
  },
  {
    tools: ["symbol_detail"],
    text: "one type's bases and what derives from or implements it: `symbol_detail(fqn, expand: \"Inheritance\")`; " +
      "its callers: `expand: \"Callers\"`",
  },
  {
    tools: ["sub_graph"],
    text: "who calls or extends a symbol, over hops: `sub_graph(seeds: [fqn], direction: \"Backward\", " +
      "edge_kinds: [\"calls\"])` or `[\"inherits\"]`",
  },
  {
    tools: ["edge_list"],
    text: "every edge of one kind, across the index or under a `root_fqn` (every base class, implementation or " +
      "import): `edge_list(edge_kinds: [\"inherits\"])`, paged by `next_cursor`, `total` counts them",
  },
  {
    tools: ["flow_trace"],
    text: "a call chain over several hops from one symbol: `flow_trace(from, direction)`, `Forward`, `Backward` " +
      "or `Both`",
  },
  {
    tools: ["impact_analysis"],
    text: "what breaks if a symbol changes: `impact_analysis(target)`",
  },
  {
    tools: ["affected_tests"],
    text: "the tests a change concerns: `affected_tests(changed_files)`, or `base` for a git ref",
  },
  {
    tools: ["dependency_graph"],
    text: "how packages or modules depend on each other: `dependency_graph` (scope `L1_Package`, `L2_Module`)",
  },
  {
    tools: ["structural_search"],
    text: "every place a code shape occurs (an await inside a loop): `structural_search` with its `language`",
  },
  {
    tools: ["count_pattern"],
    text: "how many times a text occurs in a file: `count_pattern`",
  },
  {
    tools: ["grep"],
    text: "a text across many files: `grep` with a `glob` (`output_mode: \"count\"` for how many)",
  },
];

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
  return `A result marked \`truncated\` is a sample: say so in the answer, and narrow the question (${narrowers}) to ` +
    `see the rest${shell ? ", rather than writing a script over every file" : ""}.`;
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
    shell ? "Ask the index before reading or scripting, by question:" : "Ask the index before reading, by question:",
    ...lines,
    ...(bounded ? [exhaustivenessRule(shell, rootFqn)] : []),
  ].join("\n");
}
