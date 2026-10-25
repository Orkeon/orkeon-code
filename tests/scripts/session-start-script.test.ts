// scripts/session-start.sh over fixture trees: the lines a new session gets about the dev
// work left in progress. Run:
//   node --test tests/scripts/session-start-script.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";

import {
  inProgress, KEPT_STATE_FILES, NOTHING_IN_PROGRESS, NOW, ORK_NOTHING_IN_PROGRESS, RECENT, runOrk, runOver, SCRIPT,
  STATE,
} from "./session-start-script.fixtures.ts";
import { WORKSPACE } from "../../src/shared/domain/vfs.ts";

describe("scripts/session-start.sh", () => {
  it("parses as POSIX sh", () => {
    // Arrange
    const script = SCRIPT;

    // Act
    const r = spawnSync("sh", ["-n", script]);

    // Assert
    strictEqual(r.status, 0);
  });

  for (const c of NOTHING_IN_PROGRESS) {
    it(c.name, () => {
      // Arrange
      const { files } = c;

      // Act
      const r = runOver(files);

      // Assert
      strictEqual(r.stdout, "");
    });
  }

  it("names a recent state file with its date and first open step, and the open batches of a log", () => {
    // Arrange
    const files = {
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/demo/batches-state.md": "# log\n- 2026-10-21 08:30 F1 launched\n- 2026-10-21 08:31 F2 relaunched\n- 2026-10-21 09:00 F1 returned VALID\n",
    };

    // Act
    const r = runOver(files);

    // Assert
    strictEqual(r.status, 0);
    strictEqual(r.stdout, inProgress(NOW, "demo") + "\n");
  });

  it("leaves out a state file its header dates more than 7 days back, and a batch a later `closed` closes", () => {
    // Arrange
    const files = {
      ".orkeon/dev/demo/state-F2.md": STATE.replace(/written at \S+/, "written at 2020-01-01T00:00:00Z"),
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:10 closed\n",
    };

    // Act
    const r = runOver(files);

    // Assert
    strictEqual(r.stdout, "");
  });

  for (const c of KEPT_STATE_FILES) {
    it(c.name, () => {
      // Arrange
      const files = { [c.path]: c.text };

      // Act
      const r = runOver(files, [c.path]);

      // Assert
      strictEqual(r.stdout.includes(c.line), true);
    });
  }

  it("reads a log written with CRLF line ends, and prints its header once", () => {
    // Arrange
    const files = {
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/other/batches-state.md": "- 2026-10-21 08:30 F4 launched\r\n",
    };

    // Act
    const out = runOver(files).stdout;

    // Assert
    strictEqual(out.split("Dev work in progress").length, 2, out);
    strictEqual(out.endsWith("- open batch(es) in .orkeon/dev/other/batches-state.md: F4 (/dev-batches other goes on)\n"), true, out);
  });
});

// scripts/session-start.ork.ts, the one the launcher installs: the same lines through the file tools.
describe("scripts/session-start.ork.ts", () => {
  for (const c of ORK_NOTHING_IN_PROGRESS) {
    it(c.name, async () => {
      // Arrange
      const { files, globFails } = c;

      // Act
      const printed = await runOrk(files, { globFails });

      // Assert
      strictEqual(printed, "");
    });
  }

  it("names a recent state file with its date and first open step, and the open batches of a CRLF log", async () => {
    // Arrange
    const at = /written at (\S+)/.exec(RECENT)![1];
    const files = {
      [`${WORKSPACE}/.orkeon/dev/demo/state-F2.md`]: RECENT,
      [`${WORKSPACE}/.orkeon/dev/other/batches-state.md`]: "# log\r\n- 2026-10-21 08:30 F1 launched\r\n- 2026-10-21 08:31 F2 relaunched\r\n- 2026-10-21 09:00 F1 returned VALID\r\n",
    };

    // Act
    const printed = await runOrk(files);

    // Assert
    strictEqual(printed, inProgress(at, "other"));
  });
});
