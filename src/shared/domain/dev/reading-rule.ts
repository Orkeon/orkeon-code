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
  "file for its own sake.";

/** The reading rule of a source file, for an agent that holds the node readers: by node first. */
export const NODE_READ_RULE =
  "Read a source file by node: node_outline for its members and headings, then node_read for the one you need (its " +
  "text, its range and its sha256); file_read by range only for what no node covers. Never read a source file whole.";

/** The editing rule, for an agent that holds the node editors (/dev-implement's roles). */
export const NODE_EDIT_RULE =
  "Change an existing file by node: node_replace with the selector and the sha256 node_read gave (when it is refused as " +
  "stale, read the node again), node_insert to add a member, a test or a section before, after or inside an anchor, " +
  "node_ensure for an import, a field or a section that may already be there; edit_file for a change too small for a " +
  "node. A change over several places or files is one edit_batch (validate \"parse\"): all of it applies or none. " +
  "file_write only creates a new file: writing an existing source file whole is refused.";

/** The editing rule, for an agent that changes files. */
export const EXACT_EDIT_RULE =
  "Change a file with edit_file (old_string, unique in the file, and new_string), never by writing it whole with " +
  "file_write: a file over 32 000 characters comes back cut from file_read, and a whole write from a cut read loses its end.";
