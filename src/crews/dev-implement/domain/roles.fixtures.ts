// The tools and rules the roles of a batch step are checked against.
import { IMPLEMENTER, TEST_AUTHOR } from "./roles.ts";

/** The node readers and editors every writing role holds. */
export const NODE_TOOLS: readonly string[] = ["node_outline", "node_read", "node_replace", "node_insert", "node_ensure", "edit_batch"];

/** The two writing roles. */
export const ROLES = [TEST_AUTHOR, IMPLEMENTER];

/** The crew's tools: the readers, then the writers. */
export const EXPECTED_CREW_TOOLS: readonly string[] = [
  "file_read", "node_outline", "node_read", "glob", "grep",
  "file_write", "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch",
];

/** What the node edit rule says: replace by selector and hash, a batch applies whole, file_write creates only. */
export const NODE_EDIT_RULE_SAYS: readonly string[] = [
  "node_replace with the selector and the sha256 node_read gave",
  "one edit_batch (validate \"parse\"): all of it applies or none",
  "file_write only creates a new file",
];

/** What the test author's system lets it write besides the tests. */
export const TEST_AUTHOR_STUB_SAYS: readonly string[] = ["signature stubs the brief allows", "no production line"];
