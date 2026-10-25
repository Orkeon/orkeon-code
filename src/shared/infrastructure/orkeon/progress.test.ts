// The Progress adapter over FakeTools progress_report: best effort by contract. Run:
//   node --test src/shared/infrastructure/orkeon/progress.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, doesNotReject } from "node:assert";

import { createProgress } from "./progress.ts";
import { FakeTools } from "../../../../tests/support/fake-tools.ts";
import { PROGRESS_CALLS } from "./progress.fixtures.ts";

describe("createProgress", () => {
  it("forwards a report as given", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createProgress(tools).report({ label: "Reviewing changes", step: 1, total: 2, message: "pass 1" });

    // Assert
    deepStrictEqual(tools.inputsOf("progressReport"), [{ label: "Reviewing changes", step: 1, total: 2, message: "pass 1" }]);
  });

  it("releases a slot with done: true", async () => {
    // Arrange
    const tools = new FakeTools();

    // Act
    await createProgress(tools).done("Reviewing changes");

    // Assert
    deepStrictEqual(tools.inputsOf("progressReport"), [{ label: "Reviewing changes", done: true }]);
  });

  for (const c of PROGRESS_CALLS) {
    it(`is a no-op for ${c.name} on a host without the tool`, async () => {
      // Arrange
      const progress = createProgress({});

      // Act
      const act = c.call(progress);

      // Assert
      await doesNotReject(act);
    });

    it(`swallows ${c.name} whose call fails`, async () => {
      // Arrange
      const tools = new FakeTools();
      tools.replies.progressReport = new Error("broker gone");

      // Act
      await c.call(createProgress(tools));

      // Assert
      deepStrictEqual(tools.inputsOf("progressReport").length, 1);
    });
  }
});
