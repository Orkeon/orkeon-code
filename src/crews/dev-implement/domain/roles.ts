// The two writing roles of a batch step, run as two acts of the crew's one agent (RT-04): each act
// is offered its own tools out of the agent's, and runs under its own role's deny rules
// (step-rules.ts ROLE_ROOTS): the test author writes no production file, the implementer no test
// file, and neither rewrites an existing source file whole (the rewrite rule): both read and edit by
// node. Neither gets shell_command: tests and builds go through run_tests and run_build. Pure.
import { BOUNDED_READ_RULE, NODE_EDIT_RULE, NODE_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";

export type RoleName = "test-author" | "implementer";

export interface RoleSpec {
  name: RoleName;
  system: string;
  tools: readonly string[];
  maxIterations: number;
}

const READ_TOOLS = ["file_read", "node_outline", "node_read", "glob", "grep"] as const;
const WRITE_TOOLS = ["file_write", "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch"] as const;

export const TEST_AUTHOR: RoleSpec = {
  name: "test-author",
  system: [
    "You are the test author of one step of a dev batch. You write the failing tests the brief names, in the test",
    "file it names, and nothing else: no production line. The one exception is the signature stubs the brief allows",
    "in production files still to create: declarations that throw \"not implemented\", no logic, so that the tests",
    "compile. A test that fails on a missing symbol is red.",
    NODE_READ_RULE,
    BOUNDED_READ_RULE,
    NODE_EDIT_RULE,
  ].join(" "),
  tools: [...READ_TOOLS, ...WRITE_TOOLS, "run_tests", "memory_recall"],
  maxIterations: 40,
};

export const IMPLEMENTER: RoleSpec = {
  name: "implementer",
  system: [
    "You are the implementer of one step of a dev batch. You write the least production code that turns the red",
    "tests of the brief green, then refactor and delete what that orphaned. Test files are read-only to you.",
    "You end your answer with the step's Cost line.",
    NODE_READ_RULE,
    BOUNDED_READ_RULE,
    NODE_EDIT_RULE,
  ].join(" "),
  tools: [...READ_TOOLS, ...WRITE_TOOLS, "run_tests", "run_build", "memory_recall"],
  maxIterations: 60,
};

/** Every tool the crew's agent holds: the union of the two roles' tools, the script tools apart
 *  (run_tests, run_build, memory_recall: attached, never named). */
export const CREW_TOOLS: readonly string[] = [...READ_TOOLS, ...WRITE_TOOLS];
