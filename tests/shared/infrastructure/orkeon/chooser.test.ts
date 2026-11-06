// createChooser over FakePromptConsole: what the panel is asked, and what its answer becomes. Run:
//   node --test tests/shared/infrastructure/orkeon/chooser.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { createChooser } from "../../../../src/shared/infrastructure/orkeon/chooser.ts";
import { FakePromptConsole } from "../../../support/doubles/fake-prompt-console.ts";

describe("createChooser", () => {
  it("asks a detailed select with the options as its choices", async () => {
    // Arrange
    const console = new FakePromptConsole();

    // Act
    await createChooser(console).choose({ message: "Pick", options: [{ value: "a", current: true }] });

    // Assert
    deepStrictEqual(console.specs, [
      { type: "select", message: "Pick", choices: [{ value: "a", current: true }], detailed: true },
    ]);
  });

  it("passes the control on", async () => {
    // Arrange
    const console = new FakePromptConsole();
    const control = { label: "Effort", values: ["low", "high"], value: "low" };

    // Act
    await createChooser(console).choose({ message: "Pick", options: [{ value: "a" }], control });

    // Assert
    deepStrictEqual(console.specs[0].control, control);
  });

  it("returns the value and the control of the answer", async () => {
    // Arrange
    const console = new FakePromptConsole();
    console.answer = { value: "a", control: "high" };

    // Act
    const answer = await createChooser(console).choose({ message: "Pick", options: [{ value: "a" }] });

    // Assert
    deepStrictEqual(answer, { value: "a", control: "high" });
  });

  it("returns null when the person leaves the panel", async () => {
    // Arrange
    const console = new FakePromptConsole();

    // Act
    const answer = await createChooser(console).choose({ message: "Pick", options: [{ value: "a" }] });

    // Assert
    strictEqual(answer, null);
  });

  it("reads interactive from the console", () => {
    // Arrange
    const console = new FakePromptConsole();
    console.interactive = false;

    // Act
    const interactive = createChooser(console).interactive;

    // Assert
    strictEqual(interactive, false);
  });
});
