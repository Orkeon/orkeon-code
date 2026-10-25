// The `tools.extra` values parseExtraTools and extraToolsProblem are tested on.
import type { ExtraTool } from "./permission.ts";

export interface ParseCase {
  /** The behaviour, as the test name says it. */
  name: string;
  value: unknown;
  expected: { tools: ExtraTool[]; invalid: string[] };
}

export const PARSE_CASES: readonly ParseCase[] = [
  {
    name: "reads entries separated by commas or spaces, a missing class being write",
    value: " transcribe_audio:read,search_issues  create-issue:write,, ",
    expected: {
      tools: [
        { name: "transcribe_audio", access: "read" },
        { name: "search_issues", access: "write" },
        { name: "create-issue", access: "write" },
      ],
      invalid: [],
    },
  },
  {
    name: "refuses another class, a malformed name, a built-in tool and a name given again",
    value: "a:exec b:Read :read c d!:read file_write:read shell_command c:read",
    expected: {
      tools: [{ name: "c", access: "write" }],
      invalid: ["a:exec", "b:Read", ":read", "d!:read", "file_write:read", "shell_command", "c:read"],
    },
  },
  {
    name: "compares names case-insensitively, as Orkeon does: another case is the same tool",
    value: "File_Read SHELL_COMMAND search-issues Search-Issues:read",
    expected: {
      tools: [{ name: "search-issues", access: "write" }],
      invalid: ["File_Read", "SHELL_COMMAND", "Search-Issues:read"],
    },
  },
  {
    name: "reads the crew's list one entry per item",
    value: ["post:write", "x y", 7],
    expected: {
      tools: [{ name: "post", access: "write" }, { name: "7", access: "write" }],
      invalid: ["x y"],
    },
  },
  { name: "reads nothing from a missing value", value: undefined, expected: { tools: [], invalid: [] } },
];

/** Two tools, one of each class. */
export const TWO_TOOLS: readonly ExtraTool[] = [{ name: "post", access: "write" }, { name: "fetch_doc", access: "read" }];

export interface ProblemCase {
  name: string;
  value: string;
  problem: string | undefined;
}

export const PROBLEM_CASES: readonly ProblemCase[] = [
  { name: "accepts a valid value", value: "transcribe_audio:read search_issues", problem: undefined },
  {
    name: "names the refused entries of an invalid value",
    value: "a b:exec",
    problem: "each entry is <name>[:read|:write], a tool that is not built in, named once; not: b:exec",
  },
  { name: "says a value naming no tool names none", value: ",", problem: "it names no tool" },
];
