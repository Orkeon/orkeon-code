// The session-default permission mode (commands/_lib/mode.ts): /mode over the
// session service on FakeSessionStore and FakeLogger, and the /plan toggle. Run:
//   node --test src/commands/_lib/mode.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runMode, togglePlanMode } from "./mode.ts";
import { PERMISSION_MODES, resolveFallbackMode } from "../../shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { MODE_USAGE, modeDeps, NOT_PLAN, SET_NOTE, STRIPPED } from "./mode.fixtures.ts";

describe("/mode (bare) — cycles", () => {
  it("cycles from the effective mode, the fallback when /mode set none", async () => {
    // Arrange
    const { store, session, log } = modeDeps();

    // Act
    const view = await runMode([], { session, log });

    // Assert
    deepStrictEqual(view, { text: `session default permission mode cycled default → 'acceptEdits' ${SET_NOTE}` });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "acceptEdits");
    deepStrictEqual(log.lines, []);
  });

  it("logs the catalogue strip when it cycles into a read-only mode", async () => {
    // Arrange
    const { store, session, log } = modeDeps();
    store.state.set(DEFAULT_MODE_STATE_KEY, "acceptEdits");

    // Act
    const view = await runMode([], { session, log });

    // Assert
    deepStrictEqual(view, { text: `session default permission mode cycled acceptEdits → 'plan' ${SET_NOTE}` });
    deepStrictEqual(log.lines, [STRIPPED("plan")]);
  });
});

describe("/mode show", () => {
  it("shows the effective mode and where it comes from: the fallback when /mode set none", async () => {
    // Arrange
    const { session, log } = modeDeps();

    // Act
    const view = await runMode(["show"], { session, log });

    // Assert
    deepStrictEqual(view, {
      text: `session default permission mode: default\n  ↳ ${resolveFallbackMode(undefined).explanation}\n${MODE_USAGE}`,
    });
  });

  it("shows the mode /mode set and where it comes from, without changing it", async () => {
    // Arrange
    const { store, session, log } = modeDeps();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");

    // Act
    const view = await runMode(["show"], { session, log });

    // Assert
    deepStrictEqual(view, {
      text: `session default permission mode: plan\n  ↳ session default via /mode\n${MODE_USAGE}`,
    });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "plan");
  });
});

describe("/mode <mode>", () => {
  it("sets a writing mode, logging no strip", async () => {
    // Arrange
    const { session, log } = modeDeps();

    // Act
    const view = await runMode(["bypassPermissions"], { session, log });

    // Assert
    deepStrictEqual(view, { text: `session default permission mode set to 'bypassPermissions' ${SET_NOTE}` });
    deepStrictEqual(log.lines, []);
  });

  it("sets a read-only mode, logging its strip", async () => {
    // Arrange
    const { store, session, log } = modeDeps();
    store.state.set(DEFAULT_MODE_STATE_KEY, "bypassPermissions");

    // Act
    const view = await runMode(["dontAsk"], { session, log });

    // Assert
    deepStrictEqual(view, { text: `session default permission mode set to 'dontAsk' ${SET_NOTE}` });
    strictEqual(store.state.get(DEFAULT_MODE_STATE_KEY), "dontAsk");
    deepStrictEqual(log.lines, [STRIPPED("dontAsk")]);
  });

  it("refuses an unknown mode with the known ones", async () => {
    // Arrange
    const { store, session, log } = modeDeps();

    // Act
    const view = await runMode(["Plan"], { session, log });

    // Assert
    deepStrictEqual(view, {
      text: `unknown mode 'Plan' — expected one of: ${PERMISSION_MODES.join(", ")}, show.`,
    });
    strictEqual(store.state.has(DEFAULT_MODE_STATE_KEY), false);
  });
});

describe("/plan — togglePlanMode", () => {
  for (const from of NOT_PLAN) {
    it(`enters plan from anything else: ${JSON.stringify(from) ?? "undefined"}`, () => {
      // Arrange
      const mode = from;

      // Act
      const toggled = togglePlanMode(mode);

      // Assert
      deepStrictEqual(toggled, { mode: "plan", entering: true }, String(from));
    });
  }

  it("LEAVES plan when already in it — the toggle the baseline specifies", () => {
    // Arrange
    // Pre-B-11 this wrote "plan" unconditionally: /plan twice left the session
    // read-only with no way out but /mode or /clear, reporting success both
    // times.
    const mode = "plan";

    // Act
    const toggled = togglePlanMode(mode);

    // Assert
    deepStrictEqual(toggled, { mode: "default", entering: false });
  });

  it("returns to 'default', not to the previous mode", () => {
    // Arrange
    // Restoring bypassPermissions on a second /plan would hand back write access
    // nobody asked for on that keystroke.
    const mode = "plan";

    // Act
    const toggled = togglePlanMode(mode);

    // Assert
    strictEqual(toggled.mode, "default");
  });
});
