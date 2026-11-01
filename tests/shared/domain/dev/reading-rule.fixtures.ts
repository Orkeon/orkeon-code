// The parts of the shared reading rules the dev prompts rely on.

/** What the bounded reading rule says of several reads known at once: one turn, run together by the runtime. */
export const PARALLEL_READS_MENTIONS: readonly string[] = ["several reads", "in one turn", "runs them together"];

/** The whole-file ban, said by BOUNDED_READ_RULE alone. */
export const WHOLE_FILE_BAN = "Never read a whole file for its own sake";

/** What NODE_READ_RULE says of node_read's answer, the hash an edit needs. */
export const NODE_READ_MENTIONS: readonly string[] = ["node_outline", "node_read", "sha256"];
