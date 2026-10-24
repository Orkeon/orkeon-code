// scripts/session-start.sh over fixture trees: the lines a new session gets about the dev
// work left in progress. Run:
//   node --test tests/session-start-script.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderStateFile } from "../src/shared/domain/workflow/state-file.ts";

const SCRIPT = fileURLToPath(new URL("../scripts/session-start.sh", import.meta.url));

function withTree(files: Record<string, string>, check: (root: string) => void, old: string[] = []): void {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    for (const path of old) utimesSync(join(root, path), tenDaysAgo, tenDaysAgo);
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root: string) => spawnSync("sh", [SCRIPT, root], { encoding: "utf-8" });

const STATE = renderStateFile({
  code: "demo", phase: "F2", at: "2026-10-24T10:00:00Z", trigger: "auto", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: [{ label: "Step 2 — Refuse a code", tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }],
  events: [], reports: [], tree: { lines: [] },
});

describe("scripts/session-start.sh", () => {
  it("parses as POSIX sh", () => {
    strictEqual(spawnSync("sh", ["-n", SCRIPT]).status, 0);
  });

  it("prints nothing without Code's dev state, or with nothing in progress", () => {
    withTree({ "README.md": "x" }, (root) => strictEqual(run(root).stdout, ""));
    withTree({
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:00 F1 merged abc\n- 2026-10-21 09:10 closed\n",
    }, (root) => strictEqual(run(root).stdout, ""));
  });

  it("names a recent state file with its date and first open step, and the open batches of a log", () => {
    withTree({
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/demo/batches-state.md": "# log\n- 2026-10-21 08:30 F1 launched\n- 2026-10-21 08:31 F2 relaunched\n- 2026-10-21 09:00 F1 returned VALID\n",
    }, (root) => {
      const r = run(root);
      strictEqual(r.status, 0);
      strictEqual(r.stdout,
        "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):\n" +
        "- state of a batch: .orkeon/dev/demo/state-F2.md (written 2026-10-24T10:00:00Z); first open step: Step 2 — Refuse a code. " +
        "Read it before going on with that batch.\n" +
        "- open batch(es) in .orkeon/dev/demo/batches-state.md: F2\n");
    });
  });

  it("leaves out a state file older than 7 days, and a batch a later `closed` closes", () => {
    withTree({
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:10 closed\n",
    }, (root) => strictEqual(run(root).stdout, ""), [".orkeon/dev/demo/state-F2.md"]);
  });
});
