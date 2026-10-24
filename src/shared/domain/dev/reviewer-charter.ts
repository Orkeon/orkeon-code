// The adversarial reviewer's charter: a read-only sub-agent in plan mode with seven
// read tools — files, their nodes, folders, the code index and its impact view — and no shell,
// no write and no index build. It lives in the shared domain because more than one
// crew reviews (a plan now; a specification, a change brief and the next batch later).

import type { Charter } from "../agents/charter.ts";

export const REVIEWER_TOOLS: readonly string[] = [
  "file_read", "node_read", "directory_read", "codebase_search", "symbol_source", "symbol_detail", "impact_analysis",
];

export const REVIEWER_CHARTER: Charter = {
  name: "dev-reviewer",
  role: "Adversarial reviewer",
  goal: "Find what a plan, a specification or a change brief leaves undecided, and ask it as closed questions",
  mode: "plan",
  tools: REVIEWER_TOOLS,
  disallowed: ["shell_command", "file_write", "rag_ingest", "index_codebase"],
  maxIterations: 20,
};
