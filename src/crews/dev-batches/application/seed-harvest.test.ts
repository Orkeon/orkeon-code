// A batch's worktree seeded from the main checkout before its agent is built, and its own files harvested back
// once it is merged, over FakeFiles: the seed makes a fresh worktree's files equal to the checkout's (not the
// committed copy git gave it), a reused one keeps its batch's own files; the harvest brings back only what the
// batch changed, never over a file the checkout changed since the seed, and never the plan. Run:
//   node --test src/crews/dev-batches/application/seed-harvest.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { harvestBatch, ownedBy, seedWorktree } from "./seed-harvest.ts";
import { worktreePlace } from "../../../shared/domain/git/worktree.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";

const PLACE = worktreePlace("prune-F2")!;
const TARGET = { place: PLACE, work: "todo", code: "prune", memoryDir: ".orkeon/memory", batch: "F2" };
const WT = "/workspace/.orkeon/worktrees/prune-F2";

/** Files under `base`, each folder listed by its parent as the runtime's directory_read does. */
function put(files: FakeFiles, base: string, tree: Record<string, string>): void {
  for (const [path, content] of Object.entries(tree)) {
    files.files.set(`${base}/${path}`, content);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const dir = [base, ...parts.slice(0, i - 1)].join("/");
      const name = parts[i - 1];
      const listed = files.listings.get(dir) ?? [];
      if (!listed.includes(name)) files.listings.set(dir, [...listed, name]);
    }
  }
}

const MAIN = {
  "todo/prune/PRUNE-PLAN.md": "plan",
  "todo/prune/PRUNE-PLAN-F2.md": "sheet edited in main",
  "todo/prune/PRUNE-PLAN-F3.md": "sheet F3",
  ".orkeon/dev/prune/plan.json": "{}",
  ".orkeon/config.json": "{\"dev\":{}}",
  ".orkeon/memory/decisions/a.md": "memory",
};

describe("ownedBy", () => {
  it("is the batch's sheet and verdict, capture, logs and implement record: never the plan nor another batch's", () => {
    for (const p of ["todo/prune/PRUNE-PLAN-F2.md", "todo/prune/PRUNE-VERIFY-F2.md", "todo/prune/capture-F2/table.md",
      "todo/prune/logs/F2-run_tests-1.log", ".orkeon/dev/prune/implement-F2.json"]) ok(ownedBy(TARGET, p), p);
    for (const p of ["todo/prune/PRUNE-PLAN.md", "todo/prune/PRUNE-PLAN-F3.md", "todo/prune/logs/F3-run_tests-1.log",
      "todo/prune/logs/run_tests-1.log", "todo/prune/capture-F21/x.md", ".orkeon/dev/prune/plan.json"]) ok(!ownedBy(TARGET, p), p);
  });
});

describe("seedWorktree", () => {
  it("writes every file of the checkout over a fresh worktree's committed copy, and snapshots the batch's own", async () => {
    const files = new FakeFiles();
    put(files, "/workspace", MAIN);
    put(files, WT, { "todo/prune/PRUNE-PLAN-F2.md": "sheet as committed" });
    const seeded = await seedWorktree(files, TARGET, true);
    ok(seeded.ok);
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN-F2.md`), "sheet edited in main");
    for (const [path, content] of Object.entries(MAIN)) strictEqual(files.files.get(`${WT}/${path}`), content, path);
    deepStrictEqual([...seeded.snapshot.entries()], [["todo/prune/PRUNE-PLAN-F2.md", "sheet edited in main"]]);
  });

  it("keeps a reused worktree's own files (its ticks), the rest refreshed", async () => {
    const files = new FakeFiles();
    put(files, "/workspace", MAIN);
    put(files, WT, { "todo/prune/PRUNE-PLAN-F2.md": "ticked by the batch", "todo/prune/PRUNE-PLAN.md": "old plan" });
    ok((await seedWorktree(files, TARGET, false)).ok);
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN-F2.md`), "ticked by the batch");
    strictEqual(files.files.get(`${WT}/todo/prune/PRUNE-PLAN.md`), "plan");
  });

  it("refuses a work folder or a code outside the checkout, nothing written; says a failed write", async () => {
    const files = new FakeFiles();
    put(files, "/workspace", MAIN);
    strictEqual((await seedWorktree(files, { ...TARGET, work: "/abs/elsewhere" }, true)).ok, false);
    strictEqual((await seedWorktree(files, { ...TARGET, work: "../up" }, true)).ok, false);
    strictEqual((await seedWorktree(files, { ...TARGET, code: "a'b" }, true)).ok, false);
    deepStrictEqual(files.writes, []);
    files.write = async () => { throw new Error("No space left on device"); };
    deepStrictEqual(await seedWorktree(files, TARGET, true), { ok: false, line: ".orkeon/worktrees/prune-F2 not seeded: No space left on device" });
  });
});

describe("harvestBatch", () => {
  it("brings back only what the batch changed of its own files; never the plan, nor a file it left as seeded", async () => {
    const files = new FakeFiles();
    put(files, "/workspace", MAIN);
    const seeded = await seedWorktree(files, TARGET, true);
    ok(seeded.ok);
    put(files, WT, {
      "todo/prune/PRUNE-PLAN-F2.md": "ticked", "todo/prune/PRUNE-VERIFY-F2.md": "VALID",
      "todo/prune/capture-F2/table.md": "rows", "todo/prune/logs/F2-run_tests-1.log": "exit 0",
      "todo/prune/PRUNE-PLAN.md": "plan rewritten by the batch",
    });
    files.writes = [];
    const back = await harvestBatch(files, TARGET, seeded.snapshot);
    deepStrictEqual(back, { ok: true, brought: [
      "todo/prune/PRUNE-PLAN-F2.md", "todo/prune/PRUNE-VERIFY-F2.md", "todo/prune/capture-F2/table.md", "todo/prune/logs/F2-run_tests-1.log",
    ] });
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN.md"), "plan");
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN-F2.md"), "ticked");
  });

  it("never writes over a file the checkout changed since the seed: kept there, named, the batch's copy left in the worktree", async () => {
    const files = new FakeFiles();
    put(files, "/workspace", MAIN);
    const seeded = await seedWorktree(files, TARGET, true);
    ok(seeded.ok);
    put(files, WT, { "todo/prune/PRUNE-PLAN-F2.md": "ticked" });
    files.files.set("/workspace/todo/prune/PRUNE-PLAN-F2.md", "edited again in main");
    const back = await harvestBatch(files, TARGET, seeded.snapshot);
    strictEqual(back.ok, false);
    ok(!back.ok && back.line.includes("todo/prune/PRUNE-PLAN-F2.md changed in the checkout since the seed"), JSON.stringify(back));
    strictEqual(files.files.get("/workspace/todo/prune/PRUNE-PLAN-F2.md"), "edited again in main");
  });
});
