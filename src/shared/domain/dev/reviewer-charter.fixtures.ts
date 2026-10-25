// The tools the reviewer's charters are expected to offer, and those they never offer.

/** The nine read tools, in order. */
export const NINE_READ_TOOLS: readonly string[] = [
  "file_read", "node_outline", "node_read", "directory_read", "codebase_search", "structural_search", "symbol_source",
  "symbol_detail", "impact_analysis",
];

/** The four read tools of the next-batch reviewer. */
export const FOUR_READ_TOOLS: readonly string[] = ["file_read", "node_outline", "node_read", "codebase_search"];

/** A shell, a write, an ingest and an index build. */
export const FORBIDDEN_TOOLS: readonly string[] = ["shell_command", "file_write", "rag_ingest", "index_codebase"];
