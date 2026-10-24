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

/** The editing rule, for an agent that changes files. */
export const EXACT_EDIT_RULE =
  "Change a file with edit_file (old_string, unique in the file, and new_string), never by writing it whole with " +
  "file_write: a file over 32 000 characters comes back cut from file_read, and a whole write from a cut read loses its end.";
