// /model (commands/_lib/settings/model.ts) over FakeSessionStore, FakeTelemetry and
// FakeLogger: show, list, reset and a switch, with and without a declared
// catalogue or a reported model. Run:
//   node --test tests/commands/_lib/settings/model.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { NO_MODEL_REPORTED } from "../../../../src/commands/_lib/settings/model.ts";
import { judgeModelChoice, renderModelList, NO_CATALOGUE_NOTE } from "../../../../src/shared/domain/model-catalog.ts";
import { DEFAULT_EFFORT, EFFORT_LEVELS } from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";
import { EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  DECLARED,
  NO_MODEL_SHOW_TEXT,
  PROFILE_SHOW_TEXT,
  PROFILE_SWITCHED_TEXT,
  PROFILE_SWITCH_WARNING,
  SWITCHED_TEXT,
  UNDECLARED_TEXT,
  bootShowText,
  modelHarness,
} from "./model.fixtures.ts";

describe("/model with a panel", () => {
  it("offers the declared models with the effective one marked", async () => {
    // Arrange
    const { chooser, pick } = modelHarness();

    // Act
    await pick();

    // Assert
    deepStrictEqual(chooser.asked[0].options, [{ value: "kimi-k3", current: true }, { value: "deepseek-chat" }]);
  });

  it("offers and marks an effective model the host does not declare", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "my-custom");

    // Act
    await pick();

    // Assert
    deepStrictEqual(chooser.asked[0].options.slice(0, 3), [
      { value: "kimi-k3" }, { value: "deepseek-chat" }, { value: "my-custom", current: true },
    ]);
  });

  it("keeps an undeclared model when it is confirmed", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "my-custom");
    chooser.answers = ["my-custom"];

    // Act
    const view = await pick();

    // Assert
    deepStrictEqual([view.text, session.state.get(MODEL_PREFERENCE_STATE_KEY)], ["model unchanged.", "my-custom"]);
  });

  it("offers the boot model once an override hides it", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");

    // Act
    await pick();

    // Assert
    deepStrictEqual(chooser.asked[0].options.at(-1), { value: "reset", label: "Boot model", description: "kimi-k3" });
  });

  it("gives the effort on the side arrows, the default when none is stored", async () => {
    // Arrange
    const { chooser, pick } = modelHarness();

    // Act
    await pick();

    // Assert
    deepStrictEqual(chooser.asked[0].control, { label: "Effort", values: EFFORT_LEVELS, value: DEFAULT_EFFORT });
  });

  it("switches to the model picked", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    chooser.answers = ["deepseek-chat"];

    // Act
    const view = await pick();

    // Assert
    deepStrictEqual([view.text, session.state.get(MODEL_PREFERENCE_STATE_KEY)], [SWITCHED_TEXT, "deepseek-chat"]);
  });

  it("clears the override when the boot model is picked", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");
    chooser.answers = ["reset"];

    // Act
    await pick();

    // Assert
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "");
  });

  it("stores the effort moved with the side arrows", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    chooser.answers = [{ value: "kimi-k3", control: "high" }];

    // Act
    await pick();

    // Assert
    strictEqual(session.state.get(EFFORT_STATE_KEY), "high");
  });

  it("stores no effort when the side arrows were left alone, so no provider thinking starts", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    chooser.answers = [{ value: "deepseek-chat", control: DEFAULT_EFFORT }];

    // Act
    await pick();

    // Assert
    strictEqual(session.state.has(EFFORT_STATE_KEY), false);
  });

  it("changes nothing when the model and the effort in force are confirmed", async () => {
    // Arrange
    const { session, chooser, pick } = modelHarness();
    chooser.answers = [{ value: "kimi-k3", control: DEFAULT_EFFORT }];

    // Act
    const view = await pick();

    // Assert
    deepStrictEqual([view.text, session.state.size], ["model unchanged.", 0]);
  });

  it("changes nothing when the person leaves", async () => {
    // Arrange
    const { session, pick } = modelHarness();

    // Act
    const view = await pick();

    // Assert
    deepStrictEqual([view.text, session.state.size], ["model unchanged.", 0]);
  });

  it("opens no panel on a console that cannot open one", async () => {
    // Arrange
    const { chooser, pick } = modelHarness();
    chooser.interactive = false;

    // Act
    const view = await pick();

    // Assert
    deepStrictEqual([chooser.asked, view.text], [[], bootShowText()]);
  });

  it("opens no panel when the host declares no model", async () => {
    // Arrange
    const { telemetry, chooser, pick } = modelHarness();
    telemetry.metadata = { model: "kimi-k3", availableModels: [] };

    // Act
    await pick();

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  it("opens no panel under an llm.profile, where the override is not sent", async () => {
    // Arrange
    const { chooser, pick } = modelHarness("guarded");

    // Act
    await pick();

    // Assert
    strictEqual(chooser.asked.length, 0);
  });

  it("shows without a panel on an explicit show", async () => {
    // Arrange
    const { chooser, pick } = modelHarness();

    // Act
    await pick("show");

    // Assert
    strictEqual(chooser.asked.length, 0);
  });
});

describe("/model show", () => {
  it("shows the boot model as effective, and the catalogue (the default sub-command)", async () => {
    // Arrange
    const { run } = modelHarness();

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view, { text: bootShowText() });
  });

  it("answers `show` as the default sub-command", async () => {
    // Arrange
    const { run } = modelHarness();

    // Act
    const view = await run("show");

    // Assert
    deepStrictEqual(view, { text: bootShowText() });
  });

  it("puts the session override first", async () => {
    // Arrange
    const { session, run } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "effective model for the next turn: deepseek-chat");
    strictEqual(lines[2], "  session override: deepseek-chat");
  });

  it("names the llm.profile as what the next turn runs on, the override not applied", async () => {
    // Arrange
    const { session, run } = modelHarness("guarded");
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");

    // Act
    const view = await run("show");

    // Assert
    deepStrictEqual(view, { text: PROFILE_SHOW_TEXT });
  });

  it("says the host reports no model and declares none", async () => {
    // Arrange
    const { telemetry, run } = modelHarness();
    telemetry.failure = new Error("no session tools");

    // Act
    const view = await run("show");

    // Assert
    deepStrictEqual(view, { text: NO_MODEL_SHOW_TEXT });
  });
});

describe("/model list", () => {
  it("is the catalogue alone, the effective model marked", async () => {
    // Arrange
    const { run } = modelHarness();

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, { text: `declared models (* = effective):\n${renderModelList(DECLARED, "kimi-k3")}` });
  });

  it("says why the catalogue is empty", async () => {
    // Arrange
    const { telemetry, run } = modelHarness();
    telemetry.metadata = { model: "kimi-k3" };

    // Act
    const view = await run("LIST");

    // Assert
    deepStrictEqual(view, { text: NO_CATALOGUE_NOTE });
  });
});

describe("/model reset", () => {
  it("clears the override and names the boot model", async () => {
    // Arrange
    const { session, run } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");

    // Act
    const view = await run("reset");

    // Assert
    deepStrictEqual(view, { text: "model override cleared — turns go back to kimi-k3." });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "");
  });

  it("answers `clear` as `reset`", async () => {
    // Arrange
    const { session, run } = modelHarness();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");

    // Act
    const view = await run("clear");

    // Assert
    deepStrictEqual(view, { text: "model override cleared — turns go back to kimi-k3." });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "");
  });

  it("says when the host reports no boot model", async () => {
    // Arrange
    const { telemetry, run } = modelHarness();
    telemetry.metadata = {};

    // Act
    const view = await run("reset");

    // Assert
    deepStrictEqual(view, { text: `model override cleared. Boot model: ${NO_MODEL_REPORTED}` });
  });
});

describe("/model <name>", () => {
  it("switches to a declared model", async () => {
    // Arrange
    const { session, log, run } = modelHarness();

    // Act
    const view = await run("deepseek-chat");

    // Assert
    deepStrictEqual(view, { text: SWITCHED_TEXT });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "deepseek-chat");
    deepStrictEqual(log.lines, []);
  });

  it("applies an undeclared model anyway, warning inline and in the log", async () => {
    // Arrange
    const { session, log, run } = modelHarness();

    // Act
    const view = await run("claude", "x");

    // Assert
    deepStrictEqual(view, { text: UNDECLARED_TEXT });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "claude x");
    deepStrictEqual(log.lines, [`warn: ${judgeModelChoice(DECLARED, "claude x").warning}`]);
  });

  it("stores the override under an llm.profile, saying inline that it is not sent", async () => {
    // Arrange
    const { session, run } = modelHarness("guarded");

    // Act
    const view = await run("deepseek-chat");

    // Assert
    deepStrictEqual([view, session.state.get(MODEL_PREFERENCE_STATE_KEY)], [{ text: PROFILE_SWITCHED_TEXT }, "deepseek-chat"]);
  });

  it("logs the override stored under an llm.profile as a warning", async () => {
    // Arrange
    const { log, run } = modelHarness("guarded");

    // Act
    await run("deepseek-chat");

    // Assert
    deepStrictEqual(log.lines, [`warn: ${PROFILE_SWITCH_WARNING}`]);
  });
});
