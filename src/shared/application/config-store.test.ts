// The two-layer /config store over FakeFiles and FakeSessionStore. Run:
//   node_modules/.bin/tsx --test shared/application/config-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { CONFIG_FILE_PATH, createConfigStore } from "./config-store.ts";
import { CONFIG_MAP_STATE_KEY } from "../domain/session-keys.ts";
import { FakeFiles } from "../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";

function setup() {
  const files = new FakeFiles();
  const session = new FakeSessionStore();
  return { files, session, config: createConfigStore({ files, session }) };
}

describe("config store — the settings file", () => {
  it("reads an absent file as empty, not malformed", async () => {
    const { config } = setup();
    deepStrictEqual(await config.readFile(), { map: {}, malformed: false });
  });

  it("reads an empty file as empty, not malformed", async () => {
    const { files, config } = setup();
    files.files.set(CONFIG_FILE_PATH, "  \n");
    deepStrictEqual(await config.readFile(), { map: {}, malformed: false });
  });

  it("flags a file holding malformed JSON, and reads nothing from it", async () => {
    const { files, config } = setup();
    files.files.set(CONFIG_FILE_PATH, `{ "permissions.fallback": "plan",`);
    deepStrictEqual(await config.readFile(), { map: {}, malformed: true });
    strictEqual((await config.readView()).fileMalformed, true);
  });

  it("flags a file that fails to read for another reason than absence", async () => {
    const { files, config } = setup();
    files.readErrors.set(CONFIG_FILE_PATH, new Error("access denied by mount rights"));
    deepStrictEqual(await config.readFile(), { map: {}, malformed: true });
  });

  it("reads valid JSON that is not an object as empty", async () => {
    const { files, config } = setup();
    files.files.set(CONFIG_FILE_PATH, `["plan"]`);
    deepStrictEqual(await config.readFile(), { map: {}, malformed: false });
  });

  it("round-trips a map through a pretty-printed file", async () => {
    const { files, config } = setup();
    await config.writeFile({ "advisor.model": "gpt-x" });
    deepStrictEqual(files.writes, [{ path: CONFIG_FILE_PATH, content: `{\n  "advisor.model": "gpt-x"\n}\n` }]);
    deepStrictEqual(await config.readFile(), { map: { "advisor.model": "gpt-x" }, malformed: false });
  });
});

describe("config store — the session layer", () => {
  it("reads an empty session as {}", async () => {
    const { config } = setup();
    deepStrictEqual(await config.readSession(), {});
  });

  it("round-trips the session map through the state bag", async () => {
    const { session, config } = setup();
    await config.writeSession({ "review.lenses": "security" });
    strictEqual(session.state.get(CONFIG_MAP_STATE_KEY), `{"review.lenses":"security"}`);
    deepStrictEqual(await config.readSession(), { "review.lenses": "security" });
  });

  it("reads a malformed session map as {}", async () => {
    const { session, config } = setup();
    session.state.set(CONFIG_MAP_STATE_KEY, "{oops");
    deepStrictEqual(await config.readSession(), {});
  });

  it("reads {} when the session store is unavailable", async () => {
    const { session, config } = setup();
    session.failure = new Error("no session_store tool");
    deepStrictEqual(await config.readSession(), {});
  });
});

describe("config store — layered reads", () => {
  it("leaves every key unset when both layers are empty", async () => {
    const { config } = setup();
    const view = await config.readView();
    ok(view.entries.length > 0);
    ok(view.entries.every((e) => e.source === "unset" && e.value === undefined));
    deepStrictEqual(view.unknown, []);
    strictEqual(view.fileMalformed, false);
    deepStrictEqual(await config.readValue("permissions.fallback"), { key: "permissions.fallback", value: undefined, source: "unset" });
  });

  it("lets the session override the file", async () => {
    const { files, session, config } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "plan", "review.lenses": "style" }));
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "permissions.fallback": "acceptEdits" }));
    deepStrictEqual(await config.readValue("permissions.fallback"), { key: "permissions.fallback", value: "acceptEdits", source: "session" });
    deepStrictEqual(await config.readValue("review.lenses"), { key: "review.lenses", value: "style", source: "file" });
  });

  it("reports the unknown keys of both layers, sorted and once", async () => {
    const { files, session, config } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ zeta: "1", alpha: "2" }));
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ alpha: "3" }));
    deepStrictEqual((await config.readView()).unknown, ["alpha", "zeta"]);
  });
});
