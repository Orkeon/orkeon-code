// The state file written before a compaction, over the fixture work folder
// tests/fixtures/dev/workbench/demo/, FakeFiles, FakeShell and FakeSessionStore. Run:
//   node --test src/shared/application/workflow/workflow-state.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readActiveWorkflow, writeActiveWorkflow, writeWorkflowState } from "./workflow-state.ts";
import { checkIgnoreCommand, ORKEON_IGNORE_PROBE } from "../dev/load-dev-context.ts";
import { createConfigStore } from "../config-store.ts";
import { WORKFLOW_ACTIVE_STATE_KEY } from "../../domain/session-keys.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
const STATE = "/workspace/.orkeon/dev/demo/state-F2.md";
const AT = new Date("2026-10-24T10:00:00.123Z");

function setup(pointer: string | null) {
  const files = new FakeFiles();
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`/workspace/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set("/workspace", ["workbench"]);
  files.listings.set("/workspace/workbench", ["demo"]);
  files.listings.set("/workspace/workbench/demo", names);
  const shell = new FakeShell();
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { exitCode: 0, stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results["git status --short"] = { exitCode: 0, stdout: " M src/a.ts\n?? notes.md\n" };
  const session = new FakeSessionStore();
  if (pointer !== null) session.state.set(WORKFLOW_ACTIVE_STATE_KEY, pointer);
  const config = createConfigStore({ files, session });
  return { files, shell, session, config, clock: () => AT };
}

describe("the pointer", () => {
  it("is written and read back through the session", async () => {
    const session = new FakeSessionStore();
    strictEqual(await readActiveWorkflow(session), null);
    await writeActiveWorkflow(session, { code: "demo", phase: "F2" });
    deepStrictEqual(await readActiveWorkflow(session), { code: "demo", phase: "F2" });
  });
});

describe("writeWorkflowState", () => {
  it("writes nothing and says null without a batch in progress", async () => {
    const deps = setup(null);
    strictEqual(await writeWorkflowState(deps, "auto"), null);
    deepStrictEqual(deps.files.writes, []);
  });

  it("writes the state of the named batch from its sheet, its events, its reports and git", async () => {
    const deps = setup(`{"code":"demo","phase":"F2"}`);
    deps.files.listings.set("/workspace/workbench/demo/reports", ["F2-audit.md", "F1-audit.md", "sub/"]);
    const out = await writeWorkflowState(deps, "manual");
    deepStrictEqual(out, { path: ".orkeon/dev/demo/state-F2.md", firstOpen: "Step 1 — Print the batches of a plan with their state" });
    const text = deps.files.files.get(STATE)!;
    ok(text.startsWith("# State of batch F2 of demo — written at 2026-10-24T10:00:00Z before a manual compaction"), text);
    ok(text.includes("`workbench/demo/DEMO-PLAN-F2.md`"));
    // No log of Code's own yet: the work code's <CODE>-BATCHES-STATE.md gives the events.
    ok(text.includes("- 2026-10-21 08:30 F2 launched\n"));
    ok(text.includes("- 2026-10-21 09:41 F2 returned GAPS\n"));
    ok(!text.includes("F1 launched"));
    ok(text.includes("- F2-audit.md\n") && !text.includes("F1-audit.md"));
    ok(text.includes(" M src/a.ts\n?? notes.md\n"));
    deepStrictEqual(deps.shell.commands.at(-1), "git status --short");
  });

  it("prefers Code's own event log when there is one", async () => {
    const deps = setup(`{"code":"demo","phase":"F2"}`);
    deps.files.files.set("/workspace/.orkeon/dev/demo/batches-state.md", "- 2026-10-24 09:00 F2 launched\n- 2026-10-24 09:01 F3 launched\n");
    await writeWorkflowState(deps, "auto");
    const text = deps.files.files.get(STATE)!;
    ok(text.includes("- 2026-10-24 09:00 F2 launched\n") && !text.includes("2026-10-21") && !text.includes("F3 launched"), text);
  });

  it("finds the open sheet of the batch when the step named no code", async () => {
    const deps = setup(`{"code":null,"phase":"F2"}`);
    strictEqual(((await writeWorkflowState(deps, "auto")) as { path: string }).path, ".orkeon/dev/demo/state-F2.md");
    ok(deps.files.files.has(STATE));
  });

  it("skips a done sheet, a batch without a sheet and an unknown code, writing nothing", async () => {
    for (const [pointer, skipped] of [
      [`{"code":"demo","phase":"F1"}`, "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)"],
      [`{"code":"demo","phase":"F7"}`, "no sheet of F7 in workbench/demo/"],
      [`{"code":"other","phase":"F2"}`, "no work code 'other' in workbench/ (absent)"],
      [`{"code":null,"phase":"F1"}`, "no open sheet of F1 in workbench/"],
    ]) {
      const deps = setup(pointer);
      deepStrictEqual(await writeWorkflowState(deps, "auto"), { skipped }, pointer);
      deepStrictEqual(deps.files.writes, [], pointer);
    }
  });

  it("notes a git status that failed, and throws when the file cannot be written", async () => {
    const deps = setup(`{"code":"demo","phase":"F2"}`);
    deps.shell.results["git status --short"] = { exitCode: 128, stdout: "", stderr: "fatal: not a git repository\n" };
    await writeWorkflowState(deps, "auto");
    ok(deps.files.files.get(STATE)!.includes("(git status failed: fatal: not a git repository)"));
    deps.files.write = async () => { throw new Error("read-only"); };
    await rejects(writeWorkflowState(deps, "auto"), /read-only/);
  });
});
