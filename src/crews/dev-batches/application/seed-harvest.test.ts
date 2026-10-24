// A batch's worktree seeded from the main checkout before its agent is built, and its own files harvested back
// once it settles, over FakeShell: `cp -Ru` never replaces a newer file, the plan never comes back. Run:
//   node --test src/crews/dev-batches/application/seed-harvest.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { harvestBatch, harvestCommand, seedCommand, seedWorktree } from "./seed-harvest.ts";
import { worktreePlace } from "../../../shared/domain/git/worktree.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const PLACE = worktreePlace("prune-F2")!;
const TARGET = { place: PLACE, work: "todo", code: "prune", memoryDir: ".orkeon/memory" };
const WT = ".orkeon/worktrees/prune-F2";

describe("seedCommand", () => {
  it("copies the work code's folder, its dev state, the config, the packs and the memory into the worktree", () => {
    const command = seedCommand(TARGET);
    for (const source of ["todo/prune", ".orkeon/dev/prune", ".orkeon/config.json", ".orkeon/repo.yaml", ".claude/settings.local.json", ".claude/harness/packs", ".orkeon/memory"]) {
      ok(command.includes(`'${source}'`), source);
    }
    ok(command.includes(`mkdir -p '${WT}/todo'`));
    ok(command.includes(`cp -Ru 'todo/prune' '${WT}/todo/'`));
  });

  it("never replaces a newer worktree file: every copy is `cp -Ru`, and a missing source is skipped", () => {
    const command = seedCommand(TARGET);
    const copies = command.match(/\bcp [^']*/g) ?? [];
    ok(copies.length >= 7);
    ok(copies.every((c) => c.trim() === "cp -Ru"), copies.join(" | "));
    ok(command.includes("[ ! -e '.orkeon/config.json' ] ||"));
  });

  it("creates a named work folder absent from the worktree (a submodule not checked out there)", () => {
    const command = seedCommand({ ...TARGET, work: "backstage/tasks" });
    ok(command.startsWith(`mkdir -p '${WT}/backstage/tasks'`), command);
    ok(command.includes(`cp -Ru 'backstage/tasks/prune' '${WT}/backstage/tasks/'`));
  });
});

describe("seedWorktree", () => {
  it("runs the seed once and says the shell's failure", async () => {
    const shell = new FakeShell();
    deepStrictEqual(await seedWorktree(shell, TARGET), { ok: true });
    deepStrictEqual(shell.commands, [seedCommand(TARGET)]);
    const failing = new FakeShell();
    failing.results[seedCommand(TARGET)] = { exitCode: 1, stderr: "cp: cannot create directory: Permission denied\n" };
    deepStrictEqual(await seedWorktree(failing, TARGET),
      { ok: false, line: `${WT} not seeded: cp: cannot create directory: Permission denied` });
  });

  it("refuses a work folder or a code that cannot go through the shell, nothing run", async () => {
    const shell = new FakeShell();
    strictEqual((await seedWorktree(shell, { ...TARGET, work: "/abs/elsewhere" })).ok, false);
    strictEqual((await seedWorktree(shell, { ...TARGET, code: "a'b" })).ok, false);
    strictEqual((await seedWorktree(shell, { ...TARGET, work: "../up" })).ok, false);
    deepStrictEqual(shell.commands, []);
  });
});

describe("harvestCommand", () => {
  it("brings back the batch's own files: its sheet and verdict, its capture, the logs, its implement record", () => {
    const command = harvestCommand({ ...TARGET, batch: "F2" });
    ok(command.includes(`'${WT}/todo/prune/'*-F2.md`), command);
    ok(command.includes(`'${WT}/todo/prune/capture-F2'`));
    ok(command.includes(`'${WT}/todo/prune/logs'`));
    ok(command.includes(`'${WT}/.orkeon/dev/prune/implement-F2.json'`));
    const copies = command.match(/\bcp [^'"$]*/g) ?? [];
    ok(copies.every((c) => c.trim() === "cp -Ru"), copies.join(" | "));
  });

  it("never brings back the plan, nor another batch's files", () => {
    const command = harvestCommand({ ...TARGET, batch: "F2" });
    ok(!command.includes("PLAN.md"));
    ok(!/-F3|capture-F1\b/.test(command));
    ok(!command.includes("batches-state.md") && !command.includes("batches-active.json"));
  });
});

describe("harvestBatch", () => {
  it("runs the harvest once, and says a failure without stopping the run", async () => {
    const req = { ...TARGET, batch: "F2" };
    const shell = new FakeShell();
    deepStrictEqual(await harvestBatch(shell, req), { ok: true });
    deepStrictEqual(shell.commands, [harvestCommand(req)]);
    const thrown = new FakeShell();
    thrown.errors[harvestCommand(req)] = new Error("shell_command denied");
    deepStrictEqual(await harvestBatch(thrown, req), { ok: false, line: `⚠ F2's files not brought back from ${WT}: shell_command denied` });
  });
});
