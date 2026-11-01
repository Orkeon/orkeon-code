// The auditor's charter: a read-only sub-agent in plan mode, with seven read
// tools and no shell: a command it doubts runs through the read-class
// run_validation tool when its crew offers it, or is named back to code. glob
// decides a name past the cut of the brief's project list; affected_tests gives
// the test class a validation is built on.

import type { Charter } from "../../../shared/domain/agents/charter.ts";

export const AUDITOR_TOOLS: readonly string[] = [
  "file_read", "node_read", "glob", "codebase_search", "symbol_detail", "symbol_source", "affected_tests",
];

export const AUDITOR_CHARTER: Charter = {
  name: "dev-auditor",
  role: "Batch auditor",
  goal: "Weigh one delivered batch against its code and its sheet, and answer with evidenced gaps",
  mode: "plan",
  tools: AUDITOR_TOOLS,
  disallowed: ["shell_command", "file_write", "rag_ingest"],
  maxIterations: 12,
};
