// The state keys read once and answered from the snapshot. Run:
//   node --test tests/shared/application/state-snapshot.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { stateSnapshot } from "../../../src/shared/application/state-snapshot.ts";
import { KEYS, storeWithState } from "./state-snapshot.fixtures.ts";

describe("stateSnapshot — reads", () => {
  it("reads its keys in one batch", async () => {
    // Arrange
    const store = storeWithState();

    // Act
    await stateSnapshot(store, KEYS);

    // Assert
    deepStrictEqual(store.readStatesCalls, [KEYS]);
  });

  it("answers a key of the snapshot without reading the session", async () => {
    // Arrange
    const store = storeWithState();
    const snapshot = await stateSnapshot(store, KEYS);

    // Act
    const value = await snapshot.readState("output_style");

    // Assert
    deepStrictEqual([value, store.readStateCalls], ["concise", []]);
  });

  it("answers null for a key of the snapshot never set, without reading the session", async () => {
    // Arrange
    const store = storeWithState();
    const snapshot = await stateSnapshot(store, KEYS);

    // Act
    const value = await snapshot.readState("fast_mode");

    // Assert
    deepStrictEqual([value, store.readStateCalls], [null, []]);
  });

  it("reads a key outside the snapshot from the session", async () => {
    // Arrange
    const store = storeWithState();
    const snapshot = await stateSnapshot(store, KEYS);

    // Act
    const value = await snapshot.readState("config_map");

    // Assert
    deepStrictEqual([value, store.readStateCalls], ["{}", ["config_map"]]);
  });

  it("reads every key from the session when the batch read fails", async () => {
    // Arrange
    const store = storeWithState();
    store.readStatesFailure = new Error("no batch");
    const snapshot = await stateSnapshot(store, KEYS);

    // Act
    const value = await snapshot.readState("output_style");

    // Assert
    deepStrictEqual([value, store.readStateCalls], ["concise", ["output_style"]]);
  });
});

describe("stateSnapshot — writes", () => {
  it("writes to the session", async () => {
    // Arrange
    const store = storeWithState();
    const snapshot = await stateSnapshot(store, KEYS);

    // Act
    await snapshot.writeState("fast_mode", "true");

    // Assert
    strictEqual(store.state.get("fast_mode"), "true");
  });

  it("answers a key of the snapshot written with its new value", async () => {
    // Arrange
    const store = storeWithState();
    const snapshot = await stateSnapshot(store, KEYS);
    await snapshot.writeState("output_style", null);

    // Act
    const value = await snapshot.readState("output_style");

    // Assert
    deepStrictEqual([value, store.readStateCalls], [null, []]);
  });
});
