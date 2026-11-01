// The tools the reviewer's charters are expected to offer, and those they never offer.
import type { Charter } from "../../../../src/shared/domain/agents/charter.ts";
import { NEXT_BATCH_REVIEWER_CHARTER, REVIEWER_CHARTER } from "../../../../src/shared/domain/dev/reviewer-charter.ts";

/** The ten read tools, in order. */
export const TEN_READ_TOOLS: readonly string[] = [
  "file_read", "node_outline", "node_read", "directory_read", "glob", "codebase_search", "structural_search",
  "symbol_source", "symbol_detail", "impact_analysis",
];

/** The five read tools of the next-batch reviewer. */
export const FIVE_READ_TOOLS: readonly string[] = ["file_read", "node_outline", "node_read", "glob", "codebase_search"];

/** A shell, a write, an ingest and an index build. */
export const FORBIDDEN_TOOLS: readonly string[] = ["shell_command", "file_write", "rag_ingest", "index_codebase"];

/** Both reviewer charters, each by the review it serves. */
export const REVIEWER_CHARTERS: ReadonlyArray<{ review: string; charter: Charter }> = [
  { review: "a plan, a spec or a change brief", charter: REVIEWER_CHARTER },
  { review: "the next batch", charter: NEXT_BATCH_REVIEWER_CHARTER },
];
