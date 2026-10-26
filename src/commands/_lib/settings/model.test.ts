// /model (commands/_lib/settings/model.ts) over FakeSessionStore, FakeTelemetry and
// FakeLogger: show, list, reset and a switch, with and without a declared
// catalogue or a reported model. Run:
//   node --test src/commands/_lib/settings/model.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { NO_MODEL_REPORTED } from "./model.ts";
import { judgeModelChoice, renderModelList, NO_CATALOGUE_NOTE } from "../../../shared/domain/model-catalog.ts";
import { MODEL_PREFERENCE_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import {
  DECLARED,
  NO_MODEL_SHOW_TEXT,
  SWITCHED_TEXT,
  UNDECLARED_TEXT,
  bootShowText,
  modelHarness,
} from "./model.fixtures.ts";

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
});
