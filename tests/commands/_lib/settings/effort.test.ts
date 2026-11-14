// /effort (commands/_lib/settings/effort.ts) over FakeSessionStore and FakeChooser. Run:
//   node --test tests/commands/_lib/settings/effort.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { HIGH_DROPPED, HIGH_UNCHECKED, TAKES_NO_EFFORT } from "../../../support/fixtures/reasoning.ts";
import {
  effortHarness, glmHarness, HIGH_ON_GLM_TEXT, HIGH_UNCHECKED_TEXT, HIGH_ON_PLAIN_TEXT, MEDIUM_ON_GLM_TEXT, NOTHING_STORED_ON_GLM_TEXT,
  NOTHING_STORED_TEXT, SET_HIGH_DROPPED_TEXT, SET_HIGH_TEXT, SET_MEDIUM_ON_GLM_TEXT,
  THINKING_STAYS_OFF_TEXT, UNKNOWN_LEVEL_TEXT,
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

describe("/effort on a model whose levels the runtime knows", () => {
  it("lists the levels the model takes when no level is stored", async () => {
    // Arrange
    const { run } = glmHarness();

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, NOTHING_STORED_ON_GLM_TEXT);
  });

  it("lists the levels the model takes after a stored level that goes as asked", async () => {
    // Arrange
    const { session, run } = glmHarness();
    session.state.set(EFFORT_STATE_KEY, "high");

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HIGH_ON_GLM_TEXT);
  });

  it("shows what is sent for a stored level the model does not take", async () => {
    // Arrange
    const { session, run } = glmHarness();
    session.state.set(EFFORT_STATE_KEY, "medium");

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, MEDIUM_ON_GLM_TEXT);
  });

  it("shows that nothing is sent on a model that takes no effort", async () => {
    // Arrange
    const { session, reasoning, run } = glmHarness();
    session.state.set(EFFORT_STATE_KEY, "high");
    reasoning.capabilitiesAnswer = TAKES_NO_EFFORT;
    reasoning.reports = { high: HIGH_DROPPED };

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HIGH_ON_PLAIN_TEXT);
  });

  it("stores the level asked and warns of the level sent in its place", async () => {
    // Arrange
    const { session, run } = glmHarness();

    // Act
    const view = await run("medium");

    // Assert
    deepStrictEqual([view.text, session.state.get(EFFORT_STATE_KEY)], [SET_MEDIUM_ON_GLM_TEXT, "medium"]);
  });

  it("sets a level the model takes without a warning", async () => {
    // Arrange
    const { run } = glmHarness();

    // Act
    const view = await run("high");

    // Assert
    strictEqual(view.text, SET_HIGH_TEXT);
  });

  it("warns that no effort is sent on a model that takes none", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.capabilitiesAnswer = TAKES_NO_EFFORT;
    reasoning.reports = { high: HIGH_DROPPED };

    // Act
    const view = await run("high");

    // Assert
    strictEqual(view.text, SET_HIGH_DROPPED_TEXT);
  });

  it("sets a level without a warning on a model the capability table does not know", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.capabilitiesAnswer = null;
    reasoning.reports = { high: HIGH_UNCHECKED };

    // Act
    const view = await run("high");

    // Assert
    strictEqual(view.text, SET_HIGH_TEXT);
  });

  it("shows that the stored level goes unchecked on a model the capability table does not know", async () => {
    // Arrange
    const { session, reasoning, run } = glmHarness();
    session.state.set(EFFORT_STATE_KEY, "high");
    reasoning.capabilitiesAnswer = null;
    reasoning.reports = { high: HIGH_UNCHECKED };

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HIGH_UNCHECKED_TEXT);
  });

  it("judges the model /model switched to", async () => {
    // Arrange
    const { session, reasoning, run } = glmHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "glm-5.3");

    // Act
    await run("show");

    // Assert
    deepStrictEqual(reasoning.targets[0], { profile: null, model: "glm-5.3" });
  });

  it("says in the panel what a level the model does not take is sent as", async () => {
    // Arrange
    const { chooser, run } = glmHarness();
    chooser.interactive = true;

    // Act
    await run();

    // Assert
    deepStrictEqual(
      chooser.asked[0].options.slice(0, 3).map((o) => o.description),
      ["10 act() iterations", "40 act() iterations, sent as 'low'", "80 act() iterations"],
    );
  });

  it("warns of the level sent when the level is picked in the panel", async () => {
    // Arrange
    const { session, chooser, run } = glmHarness();
    chooser.interactive = true;
    session.state.set(EFFORT_STATE_KEY, "high");
    chooser.answers = ["medium"];

    // Act
    const view = await run();

    // Assert
    strictEqual(view.text, SET_MEDIUM_ON_GLM_TEXT);
  });
});
