// JSON values of the state bag over FakeSessionStore. Run:
//   node --test src/shared/application/session-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { readJsonArray, readJsonObject, writeJson } from "./session-state.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { HOOKS_VALUE, NOT_ARRAYS, NOT_OBJECTS } from "./session-state.fixtures.ts";

describe("session state — JSON arrays", () => {
  it("reads a stored array", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set("k", `["a",{"b":1}]`);

    // Act
    const value = await readJsonArray(session, "k");

    // Assert
    deepStrictEqual(value, ["a", { b: 1 }]);
  });

  it("reads an unset value as []", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const value = await readJsonArray(session, "unset");

    // Assert
    deepStrictEqual(value, []);
  });

  for (const raw of NOT_ARRAYS) {
    it(`reads the empty, malformed or non-array value ${JSON.stringify(raw)} as []`, async () => {
      // Arrange
      const session = new FakeSessionStore();
      session.state.set("k", raw);

      // Act
      const value = await readJsonArray(session, "k");

      // Assert
      deepStrictEqual(value, [], raw);
    });
  }

  it("reads [] when the session store is unavailable", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.failure = new Error("no session_store tool");

    // Act
    const value = await readJsonArray(session, "k");

    // Assert
    deepStrictEqual(value, []);
  });
});

describe("session state — JSON objects", () => {
  it("reads a stored object", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.state.set("k", `{"review.lenses":"security"}`);

    // Act
    const value = await readJsonObject(session, "k");

    // Assert
    deepStrictEqual(value, { "review.lenses": "security" });
  });

  it("reads an unset value as {}", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    const value = await readJsonObject(session, "unset");

    // Assert
    deepStrictEqual(value, {});
  });

  for (const raw of NOT_OBJECTS) {
    it(`reads the empty, malformed or non-object value ${JSON.stringify(raw)} as {}`, async () => {
      // Arrange
      const session = new FakeSessionStore();
      session.state.set("k", raw);

      // Act
      const value = await readJsonObject(session, "k");

      // Assert
      deepStrictEqual(value, {}, raw);
    });
  }

  it("reads {} when the session store is unavailable", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.failure = new Error("no session_store tool");

    // Act
    const value = await readJsonObject(session, "k");

    // Assert
    deepStrictEqual(value, {});
  });
});

describe("session state — writing", () => {
  it("stores the value as JSON", async () => {
    // Arrange
    const session = new FakeSessionStore();

    // Act
    await writeJson(session, "k", HOOKS_VALUE);

    // Assert
    strictEqual(session.state.get("k"), `[{"event":"pre","command":"npm test"}]`);
  });

  it("reads the stored value back as written", async () => {
    // Arrange
    const session = new FakeSessionStore();
    await writeJson(session, "k", HOOKS_VALUE);

    // Act
    const value = await readJsonArray(session, "k");

    // Assert
    deepStrictEqual(value, [{ event: "pre", command: "npm test" }]);
  });
});
