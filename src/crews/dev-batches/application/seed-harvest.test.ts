// A batch's worktree seeded from the main checkout before its agent is built, and its own files harvested back
// once it is merged, over FakeFiles: the seed makes a fresh worktree's files equal to the checkout's (not the
// committed copy git gave it), a reused one keeps its batch's own files; the harvest brings back only what the
// batch changed, never over a file the checkout changed since the seed, and never the plan. Run:
//   node --test src/crews/dev-batches/application/seed-harvest.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { harvestBatch, ownedBy, seedWorktree } from "./seed-harvest.ts";
import {
  BATCH_WRITES, MAIN, NOT_OWNED_PATHS, OWNED_PATHS, TARGET, UNSAFE_TARGETS, WT, checkout, put, seededCheckout,
} from "./seed-harvest.fixtures.ts";
import { assertHolds } from "./seed-harvest.assertions.ts";

describe("ownedBy", () => {
  for (const p of OWNED_PATHS) {
    it(`is the batch's sheet and verdict, capture, logs and implement record: ${p}`, () => {
      // Arrange
      const path = p;

      // Act
      const owned = ownedBy(TARGET, path);

      // Assert
      ok(owned, p);
    });
  }

  for (const p of NOT_OWNED_PATHS) {
    it(`is never the plan nor another batch's: ${p}`, () => {
      // Arrange
      const path = p;

      // Act
      const owned = ownedBy(TARGET, path);

      // Assert
      ok(!owned, p);
    });
  }
});

describe("seedWorktree", () => {
  it("writes every file of the checkout over a fresh worktree's committed copy, and snapshots the batch's own", async () => {
    // Arrange
    const files = checkout({ "todo/prune/PRUNE-PLAN-F2.md": "sheet as committed" });

    // Act
    const seeded = await seedWorktree(files, TARGET, true);

    // Assert
    ok(seeded.ok);
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN-F2.md`), "sheet edited in main");
    assertHolds(files, WT, MAIN);
    deepStrictEqual([...seeded.snapshot.entries()], [["todo/prune/PRUNE-PLAN-F2.md", "sheet edited in main"]]);
  });

  it("keeps a reused worktree's own files (its ticks), the rest refreshed", async () => {
    // Arrange
    const files = checkout({ "todo/prune/PRUNE-PLAN-F2.md": "ticked by the batch", "todo/prune/PRUNE-PLAN.md": "old plan" });

    // Act
    const seeded = await seedWorktree(files, TARGET, false);

    // Assert
    ok(seeded.ok);
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN-F2.md`), "ticked by the batch");
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN.md`), "plan");
  });

  for (const c of UNSAFE_TARGETS) {
    it(c.name, async () => {
      // Arrange
      const files = checkout();

      // Act
      const seeded = await seedWorktree(files, c.target, true);

      // Assert
      strictEqual(seeded.ok, false);
      deepStrictEqual(files.writes, []);
    });
  }

  it("says a failed write", async () => {
    // Arrange
    const files = checkout();
    files.write = async () => { throw new Error("No space left on device"); };

    // Act
    const seeded = await seedWorktree(files, TARGET, true);

    // Assert
    deepStrictEqual(seeded, { ok: false, line: ".orkeon/worktrees/prune-F2 not seeded: No space left on device" });
  });
});

describe("harvestBatch", () => {
  it("brings back only what the batch changed of its own files; never the plan, nor a file it left as seeded", async () => {
    // Arrange
    const { files, snapshot } = await seededCheckout();
    put(files, WT, BATCH_WRITES);
    files.writes = [];

    // Act
    const back = await harvestBatch(files, TARGET, snapshot);

    // Assert
    deepStrictEqual(back, { ok: true, brought: [
      "todo/prune/PRUNE-PLAN-F2.md", "todo/prune/PRUNE-VERIFY-F2.md", "todo/prune/capture-F2/table.md", "todo/prune/logs/F2-run_tests-1.log",
    ] });
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN.md"), "plan");
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN-F2.md"), "ticked");
  });

  it("never writes over a file the checkout changed since the seed: kept there, named, the batch's copy left in the worktree", async () => {
    // Arrange
    const { files, snapshot } = await seededCheckout();
    put(files, WT, { "todo/prune/PRUNE-PLAN-F2.md": "ticked" });
    files.files.set("/workspace/todo/prune/PRUNE-PLAN-F2.md", "edited again in main");

    // Act
    const back = await harvestBatch(files, TARGET, snapshot);

    // Assert
    strictEqual(back.ok, false);
    ok(!back.ok && back.line.includes("todo/prune/PRUNE-PLAN-F2.md changed in the checkout since the seed"), JSON.stringify(back));
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN-F2.md"), "edited again in main");
  });
});
