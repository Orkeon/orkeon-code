// The tree snapshot between two acts. Run:
//   node --test src/crews/dev-implement/application/observe.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { contentHash, MAX_SNAPSHOT_PATHS, snapshot, STATUS_COMMAND } from "./observe.ts";

describe("snapshot", () => {
  it("hashes each changed path, and marks a deleted one absent", async () => {
    const shell = new FakeShell();
    shell.results[STATUS_COMMAND] = { stdout: " M src/a.ts\n D src/gone.ts\n" };
    const files = new FakeFiles();
    files.files.set("/workspace/src/a.ts", "x");
    const r = await snapshot({ shell, files });
    deepStrictEqual(r, { ok: true, snapshot: new Map([["src/a.ts", contentHash("x")], ["src/gone.ts", "absent"]]) });
  });

  it("keeps the paths alone of a tree dirtier than it can read, and refuses a status that fails", async () => {
    const shell = new FakeShell();
    shell.results[STATUS_COMMAND] = { stdout: Array.from({ length: MAX_SNAPSHOT_PATHS + 1 }, (_, i) => `?? f${i}`).join("\n") };
    const wide = await snapshot({ shell, files: new FakeFiles() });
    strictEqual(wide.ok && wide.snapshot.size === MAX_SNAPSHOT_PATHS + 1 && wide.snapshot.get("f0") === null, true);
    shell.results[STATUS_COMMAND] = { exitCode: 128 };
    strictEqual((await snapshot({ shell, files: new FakeFiles() })).ok, false);
  });

  it("tells two contents apart", () => {
    strictEqual(contentHash("ab") === contentHash("ba"), false);
  });
});
