// How a dev agent reads and edits files: one rule, shared by the dev prompts. A file_read result is
// cut at 32 000 characters and node_read's at 256 000 (Orkeon:Tools:ResultLimits); a read by
// range returns the lines asked for and says whether more follow (file_read's start_line, end_line
// and has_more, Orkeon #180), so a range never hits the cut. Pure.

/** The longest range one read asks for, in lines (the harness's read bound). */
export const MAX_READ_LINES = 120;

/** The reading rule, for an agent that reads files. */
export const BOUNDED_READ_RULE =
  `Read a file by range: file_read with offset and limit, ${MAX_READ_LINES} lines at most per read, and the next range ` +
  "only while has_more says more follows and you need it; node_read for one symbol or one heading. Never read a whole " +
  "file for its own sake. The project is mounted on /workspace: a path shown relative (src/…, workbench/…) is read " +
  "under /workspace, or the batch's working root; hand it to a tool as shown or as /workspace/<path>.";

/** The reading rule of a source file, for an agent that holds the node readers: by node first. */
export const NODE_READ_RULE =
  "Read a source file by node: node_outline for its members and headings, then node_read for the one you need (its " +
  "text, its range and its sha256); file_read by range only for what no node covers. Never read a source file whole.";

/** The shape of an edit_batch call, spelt out so that the rule and the guard's refusal of a batch without
 *  operations say the same thing (the runtime publishes the schema of the node tools too, since Orkeon #210). */
export const EDIT_BATCH_SHAPE =
  "`operations`, a list of {kind, path, selector, text} (expected_hash on node_replace, position on node_insert), with " +
  "validate \"parse\"";

/** The editing rule, for an agent that holds the node editors (dev-implement's roles). */
export const NODE_EDIT_RULE =
  "Change an existing file by node: node_replace with the selector and the sha256 node_read gave (when it is refused as " +
  "stale, read the node again), node_insert to add a member, a test or a section before, after or inside an anchor, " +
  "node_ensure for an import, a field or a section that may already be there; edit_file for a change too small for a " +
  `node. A change over several places or files is one edit_batch (${EDIT_BATCH_SHAPE}): all of it applies or none, ` +
  "and each node_replace of the batch carries the sha256 node_read gave for that very node: read every node you " +
  "replace first, never guess a hash. file_write only creates a new file: writing an existing source file whole is refused.";

/** The tool names, for every dev agent: a name it was not given is refused by the runtime without a question (Orkeon #193). */
export const KNOWN_TOOLS_RULE =
  "Only the tools you are given exist: a call to any other name (read, write, bash, …) is refused with \"ERROR: tool " +
  "'<name>' is not available to this agent.\". On that error, call one of your tools instead (file_read or node_read " +
  "to read); never call that name again.";

/** The reviewer's search for a pattern (the reviewer charter holds structural_search). */
export const STRUCTURAL_SEARCH_RULE =
  "To find every place a pattern occurs (a call shape, a construct), use structural_search with the pattern in the " +
  "target grammar ($NAME one node, $$$NAME several) rather than grep; it gives each match's enclosing symbol.";
