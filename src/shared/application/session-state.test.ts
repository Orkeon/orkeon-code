// JSON values of the state bag over FakeSessionStore. Run:
//   node --test src/shared/application/session-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { readJsonArray, readJsonObject, writeJson } from "./session-state.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";

describe("session state — JSON arrays", () => {
  it("reads a stored array", async () => {
    const session = new FakeSessionStore();
    session.state.set("k", `["a",{"b":1}]`);
    deepStrictEqual(await readJsonArray(session, "k"), ["a", { b: 1 }]);
  });

  it("reads an unset, empty, malformed or non-array value as []", async () => {
    const session = new FakeSessionStore();
    deepStrictEqual(await readJsonArray(session, "unset"), []);
    for (const raw of ["", "[oops", `{"a":1}`, "null", "3"]) {
      session.state.set("k", raw);
      deepStrictEqual(await readJsonArray(session, "k"), [], raw);
    }
  });

  it("reads [] when the session store is unavailable", async () => {
    const session = new FakeSessionStore();
    session.failure = new Error("no session_store tool");
    deepStrictEqual(await readJsonArray(session, "k"), []);
  });
});

describe("session state — JSON objects", () => {
  it("reads a stored object", async () => {
    const session = new FakeSessionStore();
    session.state.set("k", `{"review.lenses":"security"}`);
    deepStrictEqual(await readJsonObject(session, "k"), { "review.lenses": "security" });
  });

  it("reads an unset, empty, malformed or non-object value as {}", async () => {
    const session = new FakeSessionStore();
    deepStrictEqual(await readJsonObject(session, "unset"), {});
    for (const raw of ["", "{oops", `["a"]`, "null", `"text"`]) {
      session.state.set("k", raw);
      deepStrictEqual(await readJsonObject(session, "k"), {}, raw);
    }
  });

  it("reads {} when the session store is unavailable", async () => {
    const session = new FakeSessionStore();
    session.failure = new Error("no session_store tool");
    deepStrictEqual(await readJsonObject(session, "k"), {});
  });
});

describe("session state — writing", () => {
  it("stores the value as JSON, read back as written", async () => {
    const session = new FakeSessionStore();
    await writeJson(session, "k", [{ event: "pre", command: "npm test" }]);
    strictEqual(session.state.get("k"), `[{"event":"pre","command":"npm test"}]`);
    deepStrictEqual(await readJsonArray(session, "k"), [{ event: "pre", command: "npm test" }]);
  });
});
