// The adversarial reviewer's charter: a read-only sub-agent in plan mode with ten read tools — files,
// their nodes, folders, a file pattern lookup (glob, which the cut project list names), the code index, a
// structural pattern search and its impact view — and no shell,
// no write and no index build. It lives in the shared domain because more than one
// crew reviews (a plan now; a specification, a change brief and the next batch later).

import type { Charter } from "../agents/charter.ts";

export const REVIEWER_TOOLS: readonly string[] = [
  "file_read", "node_outline", "node_read", "directory_read", "glob", "codebase_search", "structural_search",
  "symbol_source", "symbol_detail", "impact_analysis",
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

/** The review of the next batch of /dev-batches: its brief carries the batch's sheet and what the closed batches
 *  changed, so five read tools and eight turns are enough (a plan's review keeps the ten and its twenty); glob is one
 *  of them, since its brief lists the project's files and a cut list sends the reader to it. */
export const NEXT_BATCH_REVIEWER_CHARTER: Charter = {
  ...REVIEWER_CHARTER,
  tools: ["file_read", "node_outline", "node_read", "glob", "codebase_search"],
  maxIterations: 8,
};
