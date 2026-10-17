// /model (commands/_lib/model.ts) over FakeSessionStore, FakeTelemetry and
// FakeLogger: show, list, reset and a switch, with and without a declared
// catalogue or a reported model. Run:
//   node --test tests/commands-model.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { NO_MODEL_REPORTED, runModel } from "../src/commands/_lib/model.ts";
import { judgeModelChoice, renderModelList, NO_CATALOGUE_NOTE } from "../src/shared/domain/model-catalog.ts";
import { MODEL_PREFERENCE_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";

const USAGE = "usage: /model <name> | /model list | /model reset | /model show";

function setup() {
  const session = new FakeSessionStore();
  const telemetry = new FakeTelemetry();
  telemetry.metadata = { model: "kimi-k3", availableModels: ["kimi-k3", "deepseek-chat"] };
  const log = new FakeLogger();
  const run = (...tokens: string[]) => runModel(tokens, { session, telemetry, log });
  return { session, telemetry, log, run };
}

describe("/model show", () => {
  it("shows the boot model as effective, and the catalogue (the default sub-command)", async () => {
    const { run } = setup();
    deepStrictEqual(await run(), {
      text: "effective model for the next turn: kimi-k3\n" +
        "  boot model      : kimi-k3\n" +
        "  session override: (none)\n" +
        `declared models (* = effective):\n${renderModelList(["kimi-k3", "deepseek-chat"], "kimi-k3")}\n` +
        USAGE,
    });
    deepStrictEqual(await run("show"), await run());
  });

  it("puts the session override first", async () => {
    const { session, run } = setup();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[0], "effective model for the next turn: deepseek-chat");
    strictEqual(lines[2], "  session override: deepseek-chat");
  });

  it("says the host reports no model and declares none", async () => {
    const { telemetry, run } = setup();
    telemetry.failure = new Error("no session tools");
    deepStrictEqual(await run("show"), {
      text: "effective model for the next turn: (none — see below)\n" +
        `  boot model      : ${NO_MODEL_REPORTED}\n` +
        "  session override: (none)\n" +
        `declared models: ${NO_CATALOGUE_NOTE}\n` +
        USAGE,
    });
  });
});

describe("/model list", () => {
  it("is the catalogue alone, the effective model marked", async () => {
    deepStrictEqual(await setup().run("list"), {
      text: `declared models (* = effective):\n${renderModelList(["kimi-k3", "deepseek-chat"], "kimi-k3")}`,
    });
  });

  it("says why the catalogue is empty", async () => {
    const { telemetry, run } = setup();
    telemetry.metadata = { model: "kimi-k3" };
    deepStrictEqual(await run("LIST"), { text: NO_CATALOGUE_NOTE });
  });
});

describe("/model reset", () => {
  it("clears the override and names the boot model", async () => {
    const { session, run } = setup();
    session.state.set(MODEL_PREFERENCE_STATE_KEY, "deepseek-chat");
    deepStrictEqual(await run("reset"), { text: "model override cleared — turns go back to kimi-k3." });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "");
    deepStrictEqual(await run("clear"), await run("reset"));
  });

  it("says when the host reports no boot model", async () => {
    const { telemetry, run } = setup();
    telemetry.metadata = {};
    deepStrictEqual(await run("reset"), { text: `model override cleared. Boot model: ${NO_MODEL_REPORTED}` });
  });
});

describe("/model <name>", () => {
  it("switches to a declared model", async () => {
    const { session, log, run } = setup();
    deepStrictEqual(await run("deepseek-chat"), {
      text: "model set to 'deepseek-chat' — it applies from the next /assistant turn, no relaunch.\n" +
        "It travels over the configured provider, so it must be a model that provider serves; " +
        "/reset-session (or /model reset) returns to the boot model.",
    });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "deepseek-chat");
    deepStrictEqual(log.lines, []);
  });

  it("applies an undeclared model anyway, warning inline and in the log", async () => {
    const { session, log, run } = setup();
    deepStrictEqual(await run("claude", "x"), {
      text: "model set to 'claude x' — ⚠ NOT among the models this host declares " +
        "(kimi-k3, deepseek-chat). Applied anyway; see the log. /model list to review.",
    });
    strictEqual(session.state.get(MODEL_PREFERENCE_STATE_KEY), "claude x");
    deepStrictEqual(log.lines, [`warn: ${judgeModelChoice(["kimi-k3", "deepseek-chat"], "claude x").warning}`]);
  });
});
