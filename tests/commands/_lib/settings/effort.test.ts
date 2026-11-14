// /effort (commands/_lib/settings/effort.ts) over FakeSessionStore and FakeChooser. Run:
//   node --test tests/commands/_lib/settings/effort.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import {
  HIGH_AS_ASKED, HIGH_DROPPED, HIGH_UNCHECKED, MEDIUM_LOWERED, MEDIUM_SWITCHED_OFF, QWEN_TAKES, TAKES_NO_EFFORT, UNKNOWN_TAKES, XHIGH_LOWERED_UNKNOWN,
} from "../../../support/fixtures/reasoning.ts";
import {
  effortHarness, glmHarness, HIGH_ON_GLM_TEXT, HIGH_UNCHECKED_TEXT, HIGH_ON_PLAIN_TEXT, MEDIUM_ON_GLM_TEXT, NOTHING_STORED_ON_GLM_TEXT,
  NOTHING_STORED_TEXT, SET_HIGH_DROPPED_TEXT, SET_HIGH_TEXT, SET_MEDIUM_ON_GLM_TEXT, SET_MEDIUM_SWITCHED_OFF_TEXT,
  NO_THINKING_ASKED_TEXT, UNKNOWN_LEVEL_TEXT, DEV_STEPS_CASES, HOST_HIGH_ON_GLM_TEXT, HOST_MEDIUM_ON_GLM_TEXT, PANEL_CASES,
  SHOW_DEV_STEPS_CASES, TARGET_CASES, XHIGH_LOWERED_UNKNOWN_TEXT, profiledHarness,
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
    deepStrictEqual([view.text, session.state.size], [NO_THINKING_ASKED_TEXT, 0]);
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
    reasoning.capabilitiesAnswer = UNKNOWN_TAKES;
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
    reasoning.capabilitiesAnswer = UNKNOWN_TAKES;
    reasoning.reports = { high: HIGH_UNCHECKED };

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HIGH_UNCHECKED_TEXT);
  });

  for (const c of TARGET_CASES) {
    it(c.name, async () => {
      // Arrange
      const { session, reasoning, run } = glmHarness();
      session.state.set(MODEL_PREFERENCE_STATE_KEY, c.override);

      // Act
      await run("show");

      // Assert
      deepStrictEqual(reasoning.targets[0], c.target);
    });
  }

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

  for (const c of PANEL_CASES) {
    it(c.name, async () => {
      // Arrange
      const { chooser, reasoning, run } = glmHarness();
      chooser.interactive = true;
      reasoning.reports = { high: c.report };

      // Act
      await run();

      // Assert
      strictEqual(chooser.asked[0].options[2].description, c.description);
    });
  }

  it("names no levels when no level is stored on a model the capability table does not know", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.capabilitiesAnswer = UNKNOWN_TAKES;

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, NOTHING_STORED_TEXT);
  });

  it("names no levels after a lowered level on a model the capability table does not know", async () => {
    // Arrange
    const { session, reasoning, run } = glmHarness();
    session.state.set(EFFORT_STATE_KEY, "xhigh");
    reasoning.capabilitiesAnswer = UNKNOWN_TAKES;
    reasoning.reports = { xhigh: XHIGH_LOWERED_UNKNOWN };

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, XHIGH_LOWERED_UNKNOWN_TEXT);
  });
});

describe("/effort and the level the host's own configuration asks for", () => {
  it("says the host asks for a level when the session stored none", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.hostReport = HIGH_AS_ASKED;

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HOST_HIGH_ON_GLM_TEXT);
  });

  it("says what the host's level is sent as when the model does not take it", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.hostReport = MEDIUM_LOWERED;

    // Act
    const view = await run("show");

    // Assert
    strictEqual(view.text, HOST_MEDIUM_ON_GLM_TEXT);
  });

  it("asks the runtime what the host sends with no level when the session stored none", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();

    // Act
    await run("show");

    // Assert
    deepStrictEqual(reasoning.levelsAsked, [null]);
  });
});

describe("/effort under an llm.profile", () => {
  it("judges the profile's model, not the /model override", async () => {
    // Arrange
    const { reasoning, run } = profiledHarness();

    // Act
    await run("show");

    // Assert
    deepStrictEqual(reasoning.targets[0], { profile: "large", model: "deepseek-chat" });
  });

  it("warns of the level the profile's model sends in place of the one set", async () => {
    // Arrange
    const { run } = profiledHarness();

    // Act
    const view = await run("medium");

    // Assert
    strictEqual(view.text, SET_MEDIUM_ON_GLM_TEXT);
  });

  it("asks nothing of the host's own model under a profile", async () => {
    // Arrange
    const { reasoning, run } = profiledHarness();

    // Act
    await run("medium");

    // Assert
    deepStrictEqual(reasoning.targets.filter((target) => target.profile === null), []);
  });
});

describe("/effort on a level the host's settings drop", () => {
  it("leaves the model's levels out of the warning when the model takes the level", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();
    reasoning.capabilitiesAnswer = QWEN_TAKES;
    reasoning.reports = { medium: MEDIUM_SWITCHED_OFF };

    // Act
    const view = await run("medium");

    // Assert
    strictEqual(view.text, SET_MEDIUM_SWITCHED_OFF_TEXT);
  });
});

describe("/effort under a /model override", () => {
  for (const c of DEV_STEPS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { session, reasoning, run } = glmHarness();
      session.state.set(MODEL_PREFERENCE_STATE_KEY, "glm-5.3");
      reasoning.byModel = c.byModel;

      // Act
      const view = await run("medium");

      // Assert
      strictEqual(view.text, c.text);
    });
  }
});

describe("/effort show under a /model override", () => {
  for (const c of SHOW_DEV_STEPS_CASES) {
    it(c.name, async () => {
      // Arrange
      const { session, reasoning, run } = glmHarness();
      session.state.set(MODEL_PREFERENCE_STATE_KEY, "glm-5.3");
      if (c.stored !== null) session.state.set(EFFORT_STATE_KEY, c.stored);
      reasoning.byModel = c.byModel;

      // Act
      const view = await run("show");

      // Assert
      strictEqual(view.text, c.text);
    });
  }

  it("asks nothing of the host's own model on show when the session runs on it", async () => {
    // Arrange
    const { reasoning, run } = glmHarness();

    // Act
    await run("show");

    // Assert
    strictEqual(reasoning.targets.length, 2);
  });
});
