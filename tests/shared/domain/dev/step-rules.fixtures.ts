// Layouts, tools and the lines expected of the dev steps' rules.
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** The line refusing /dev-plan when the host's gate is off. */
export const DEV_PLAN_GATE_OFF =
  "dev-plan: refused: the host's permission gate is off (Orkeon:Security:PermissionGate:Enabled is not true), " +
  "so the step's rule sets and its read-only mode would check nothing. The launcher turns the gate on unless a " +
  "settings file turns it off: remove that setting, restart the REPL and run /dev-plan again.";

/** A pack naming the domain and the tests, not the application nor the infrastructure. */
export const PILOT_LAYOUT = { domain: "src/core/Orkeon.Domain", tests: "tests" };

/** The pilot's first four rules: no read nor glob under the domain, in either path form. */
export const PILOT_FIRST_RULES: readonly string[] = [
  `deny file_read path=${WORKSPACE}/src/core/Orkeon.Domain/*`,
  "deny file_read path=src/core/Orkeon.Domain/*",
  `deny glob path=${WORKSPACE}/src/core/Orkeon.Domain/*`,
  "deny glob path=src/core/Orkeon.Domain/*",
];

/** Read tools the pilot may not point at the tests. */
export const PILOT_READ_TOOLS: readonly string[] = ["file_read", "grep", "node_outline", "documents_of", "directory_search"];

/** A pack naming every source root and the test folder. */
export const FULL_LAYOUT = { domain: "src/d", application: "src/a", infrastructure: "src/i", tests: "tests" };

/** A test file and a source file of FULL_LAYOUT. */
export const TEST_FILE = { path: `${WORKSPACE}/tests/a.test.ts` };
export const SOURCE_FILE = { path: `${WORKSPACE}/src/d/x.ts` };

/** The editors other than file_write. */
export const EDITORS: readonly string[] = ["edit_file", "node_replace", "node_insert", "node_ensure"];

/** A pack whose tests sit beside the code. */
export const BESIDE_LAYOUT = { domain: "src", testFiles: ["src/*.test.ts"] };

/** A pack with a blank root, a ./ test folder and a test pattern out of the checkout. */
export const REWRITE_LAYOUT = {
  domain: "src/d", application: "src/a", infrastructure: "", tests: "./tests/", testFiles: ["src/*.test.ts", "../x/*"],
};

/** The rewrite rule of REWRITE_LAYOUT: no file_write on any source root or test pattern. */
export const REWRITE_RULES: readonly string[] = [
  `deny file_write path=${WORKSPACE}/src/d/*`, "deny file_write path=src/d/*",
  `deny file_write path=${WORKSPACE}/src/a/*`, "deny file_write path=src/a/*",
  `deny file_write path=${WORKSPACE}/tests/*`, "deny file_write path=tests/*",
  `deny file_write path=${WORKSPACE}/src/*.test.ts`, "deny file_write path=src/*.test.ts",
];

/** A step, and the command a line names for it once /dev-change, /dev-implement and /dev-verify became shapes. */
export const STEP_COMMAND_CASES: readonly { step: string; command: string }[] = [
  { step: "dev-change", command: "dev-spec" },
  { step: "dev-implement", command: "dev-batches" },
  { step: "dev-verify", command: "dev-batches" },
  { step: "dev-spec", command: "dev-spec" },
  { step: "dev-plan", command: "dev-plan" },
  { step: "dev-batches", command: "dev-batches" },
];
