// The Progress adapter over FakeTools progress_report: best effort by contract. Run:
//   node --test src/shared/infrastructure/orkeon/progress.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { createProgress } from "./progress.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";

describe("createProgress", () => {
  it("forwards a report as given", async () => {
    const tools = new FakeTools();
    await createProgress(tools).report({ label: "Reviewing changes", step: 1, total: 2, message: "pass 1" });
    deepStrictEqual(tools.inputsOf("progressReport"), [{ label: "Reviewing changes", step: 1, total: 2, message: "pass 1" }]);
  });

  it("releases a slot with done: true", async () => {
    const tools = new FakeTools();
    await createProgress(tools).done("Reviewing changes");
    deepStrictEqual(tools.inputsOf("progressReport"), [{ label: "Reviewing changes", done: true }]);
  });

  it("is a no-op on a host without the tool", async () => {
    const progress = createProgress({});
    await progress.report({ label: "x" });
    await progress.done("x");
  });

  it("swallows a failing call", async () => {
    const tools = new FakeTools();
    tools.replies.progressReport = new Error("broker gone");
    await createProgress(tools).report({ label: "x" });
    await createProgress(tools).done("x");
    deepStrictEqual(tools.inputsOf("progressReport").length, 2);
  });
});
