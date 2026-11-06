// /effort (commands/_lib/settings/effort.ts) over FakeSessionStore and FakeChooser. Run:
//   node --test tests/commands/_lib/settings/effort.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { EFFORT_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  effortHarness, NOTHING_STORED_TEXT, SET_HIGH_TEXT, THINKING_STAYS_OFF_TEXT, UNKNOWN_LEVEL_TEXT,
} from "./effort.fixtures.ts";

describe("/effort without a panel", () => {
  it("shows the default level and no provider thinking when no level is stored", async () => {
    // Arrange
    const { run } = effortHarness();

    // Act
    const view = await run();

    // Assert
    strictEqual(view.text, NOTHING_STORED_TEXT);
  });

  it("stores the level given, in lower case, and says what it buys", async () => {
    // Arrange
    const { session, run } = effortHarness();

    // Act
    const view = await run("HIGH");

    // Assert
    deepStrictEqual([view.text, session.state.get(EFFORT_STATE_KEY)], [SET_HIGH_TEXT, "high"]);
  });

  it("refuses an unknown level and stores nothing", async () => {
    // Arrange
    const { session, run } = effortHarness();

    // Act
    const view = await run("huge");

    // Assert
    deepStrictEqual([view.text, session.state.size], [UNKNOWN_LEVEL_TEXT, 0]);
  });
});

describe("/effort with a panel", () => {
  it("shows the level on an explicit show", async () => {
    // Arrange
    const { chooser, run } = effortHarness();
    chooser.interactive = true;

    // Act
    const view = await run("show");

    // Assert
    deepStrictEqual([view.text, chooser.asked.length], [NOTHING_STORED_TEXT, 0]);
  });

  it("offers the levels with the stored one marked", async () => {
    // Arrange
    const { session, chooser, run } = effortHarness();
    chooser.interactive = true;
    session.state.set(EFFORT_STATE_KEY, "high");

    // Act
    await run();

    // Assert
    deepStrictEqual(chooser.asked[0].options.filter((o) => o.current).map((o) => o.value), ["high"]);
  });

  it("says how many iterations each level gives", async () => {
    // Arrange
    const { chooser, run } = effortHarness();
    chooser.interactive = true;

    // Act
    await run();

    // Assert
    strictEqual(chooser.asked[0].options[0].description, "10 act() iterations");
  });

  it("stores the level picked", async () => {
    // Arrange
    const { session, chooser, run } = effortHarness();
    chooser.interactive = true;
    chooser.answers = ["high"];

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, session.state.get(EFFORT_STATE_KEY)], [SET_HIGH_TEXT, "high"]);
  });

  it("requests no provider thinking when the level marked is confirmed and none is stored", async () => {
    // Arrange
    const { session, chooser, run } = effortHarness();
    chooser.interactive = true;
    chooser.answers = ["medium"];

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, session.state.size], [THINKING_STAYS_OFF_TEXT, 0]);
  });

  it("stores nothing when the person leaves", async () => {
    // Arrange
    const { session, chooser, run } = effortHarness();
    chooser.interactive = true;

    // Act
    const view = await run();

    // Assert
    deepStrictEqual([view.text, session.state.size], ["reasoning effort unchanged.", 0]);
  });

  it("opens no panel when a level is given", async () => {
    // Arrange
    const { chooser, run } = effortHarness();
    chooser.interactive = true;

    // Act
    await run("low");

    // Assert
    strictEqual(chooser.asked.length, 0);
  });
});
