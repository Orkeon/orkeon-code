// /output-style (commands/_lib/settings/output-style.ts) over FakeSessionStore and FakeChooser. Run:
//   node --test tests/commands/_lib/settings/output-style.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { OUTPUT_STYLE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  CONCISE_SHOW_TEXT, DEFAULT_SHOW_TEXT, SET_CONCISE_TEXT, UNKNOWN_STYLE_TEXT, outputStyleHarness,
} from "./output-style.fixtures.ts";

describe("/output-style without a panel", () => {
  it("shows the default style when none is stored", async () => {
    // Arrange
    const { run } = outputStyleHarness();

    // Act
    const view = await run();

    // Assert
    strictEqual(view.text, DEFAULT_SHOW_TEXT);
  });

  it("shows the stored style on show", async () => {
    // Arrange
    const { session, run } = outputStyleHarness();
    session.state.set(OUTPUT_STYLE_STATE_KEY, "concise");

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, CONCISE_SHOW_TEXT);
  });

  it("stores the style given", async () => {
    // Arrange
    const { session, run } = outputStyleHarness();

    // Act
    const view = await run("concise");

    // Assert
    deepStrictEqual([view.text, session.state.get(OUTPUT_STYLE_STATE_KEY)], [SET_CONCISE_TEXT, "concise"]);
  });

  it("refuses an unknown style and stores nothing", async () => {
    // Arrange
    const { session, run } = outputStyleHarness();

    // Act
    const view = await run("loud");

    // Assert
    deepStrictEqual([view.text, session.state.size], [UNKNOWN_STYLE_TEXT, 0]);
  });
});

describe("/output-style with a panel", () => {
  it("offers the styles with the one in force marked", async () => {
    // Arrange
    const { chooser, run } = outputStyleHarness();
    chooser.interactive = true;

    // Act
    await run();

    // Assert
    deepStrictEqual(chooser.asked[0].options, [
      { value: "default", current: true }, { value: "concise" }, { value: "explanatory" }, { value: "learning" },
    ]);
  });

  it("stores the style picked", async () => {
    // Arrange
    const { session, chooser, run } = outputStyleHarness();
    chooser.interactive = true;
    chooser.answers = ["concise"];

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, session.state.get(OUTPUT_STYLE_STATE_KEY)], [SET_CONCISE_TEXT, "concise"]);
  });

  it("stores nothing when the person leaves", async () => {
    // Arrange
    const { session, chooser, run } = outputStyleHarness();
    chooser.interactive = true;

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, session.state.size], ["output style unchanged.", 0]);
  });

  it("shows the style without a panel on show", async () => {
    // Arrange
    const { chooser, run } = outputStyleHarness();
    chooser.interactive = true;

    // Act
    await run("show");

    // Assert
    strictEqual(chooser.asked.length, 0);
  });
});
