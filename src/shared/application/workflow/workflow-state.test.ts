// The state file written before a compaction, over the fixture work folder
// tests/fixtures/dev/workbench/demo/, FakeFiles, FakeShell and FakeSessionStore. Run:
//   node --test src/shared/application/workflow/workflow-state.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { readActiveWorkflow, writeActiveWorkflow, writeWorkflowState } from "./workflow-state.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { DEMO_F2, SKIPPED_POINTERS, STATE, workflowSetup } from "./workflow-state.fixtures.ts";
import { assertMentions, assertOmits } from "./workflow-state.assertions.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("the pointer", () => {
  it("reads as null before one is written", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const pointer = await readActiveWorkflow(session);

    // Assert
    strictEqual(pointer, null);
  });

  it("is written and read back through the session", async () => {
    // Arrange
    const session = new FakeSessionStore();
    await writeActiveWorkflow(session, { code: "demo", phase: "F2" });

    // Act
    const pointer = await readActiveWorkflow(session);

    // Assert
    deepStrictEqual(pointer, { code: "demo", phase: "F2" });
  });
});

describe("writeWorkflowState", () => {
  it("writes nothing and says null without a batch in progress", async () => {
    // Arrange
    const deps = workflowSetup(null);

    // Act
    const out = await writeWorkflowState(deps, "auto");

    // Assert
    strictEqual(out, null);
    deepStrictEqual(deps.files.writes, []);
  });

  it("writes the state of the named batch from its sheet, its events, its reports and git", async () => {
    // Arrange
    const deps = workflowSetup(DEMO_F2);
    deps.files.listings.set(`${WORKSPACE}/workbench/demo/reports`, ["F2-audit.md", "F1-audit.md", "sub/"]);

    // Act
    const out = await writeWorkflowState(deps, "manual");

    // Assert
    deepStrictEqual(out, { path: ".orkeon/dev/demo/state-F2.md", firstOpen: "Step 1 — Print the batches of a plan with their state" });
    const text = deps.files.files.get(STATE)!;
    ok(text.startsWith("# State of batch F2 of demo — written at 2026-10-24T10:00:00Z before a manual compaction"), text);
    // No log of Code's own yet: the work code's <CODE>-BATCHES-STATE.md gives the events.
    assertMentions(text, [
      "`workbench/demo/DEMO-PLAN-F2.md`",
      "- 2026-10-21 08:30 F2 launched\n",
      "- 2026-10-21 09:41 F2 returned GAPS\n",
      "- F2-audit.md\n",
      " M src/a.ts\n?? notes.md\n",
    ]);
    assertOmits(text, ["F1 launched", "F1-audit.md"]);
    deepStrictEqual(deps.shell.commands.at(-1), "git status --short");
  });

  it("prefers Code's own event log when there is one", async () => {
    // Arrange
    const deps = workflowSetup(DEMO_F2);
    deps.files.files.set(`${WORKSPACE}/.orkeon/dev/demo/batches-state.md`, "- 2026-10-24 09:00 F2 launched\n- 2026-10-24 09:01 F3 launched\n");

    // Act
    await writeWorkflowState(deps, "auto");

    // Assert
    const text = deps.files.files.get(STATE)!;
    ok(text.includes("- 2026-10-24 09:00 F2 launched\n") && !text.includes("2026-10-21") && !text.includes("F3 launched"), text);
  });

  it("finds the open sheet of the batch when the step named no code", async () => {
    // Arrange
    const deps = workflowSetup(`{"code":null,"phase":"F2"}`);

    // Act
    const out = await writeWorkflowState(deps, "auto");

    // Assert
    strictEqual((out as { path: string }).path, ".orkeon/dev/demo/state-F2.md");
    ok(deps.files.files.has(STATE));
  });

  for (const c of SKIPPED_POINTERS) {
    it(`skips a done sheet, a batch without a sheet and an unknown code, writing nothing: ${c.pointer}`, async () => {
      // Arrange
      const deps = workflowSetup(c.pointer);

      // Act
      const out = await writeWorkflowState(deps, "auto");

      // Assert
      deepStrictEqual(out, { skipped: c.skipped }, c.pointer);
      deepStrictEqual(deps.files.writes, [], c.pointer);
    });
  }

  it("notes a git status that failed", async () => {
    // Arrange
    const deps = workflowSetup(DEMO_F2);
    deps.shell.results["git status --short"] = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository\n" };

    // Act
    await writeWorkflowState(deps, "auto");

    // Assert
    ok(deps.files.files.get(STATE)!.includes("(git status failed: fatal: not a git repository)"));
  });

  it("throws when the file cannot be written", async () => {
    // Arrange
    const deps = workflowSetup(DEMO_F2);
    deps.shell.results["git status --short"] = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository\n" };
    deps.files.write = async () => { throw new Error("read-only"); };

    // Act
    const act = writeWorkflowState(deps, "auto");

    // Assert
    await rejects(act, /read-only/);
  });
});
