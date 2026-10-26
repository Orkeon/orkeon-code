// The two-layer /config store over FakeFiles and FakeSessionStore. Run:
//   node --test tests/shared/application/config-store.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH } from "../../../src/shared/application/config-store.ts";
import { CONFIG_MAP_STATE_KEY } from "../../../src/shared/domain/session-keys.ts";
import { MALFORMED_PROJECT_FILE, configHarness, sessionOverFile } from "./config-store.fixtures.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("config store — the settings file", () => {
  it("reads an absent file as empty, not malformed", async () => {
    // Arrange
    const { config } = configHarness();

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: false });
  });

  it("reads an empty file as empty, not malformed", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, "  \n");

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: false });
  });

  it("flags a file holding malformed JSON, and reads nothing from it", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, MALFORMED_PROJECT_FILE);

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: true });
  });

  it("flags a file holding malformed JSON in the view", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, MALFORMED_PROJECT_FILE);

    // Act
    const view = await config.readView();

    // Assert
    strictEqual(view.fileMalformed, true);
  });

  it("flags a file that fails to read for another reason than absence", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.readErrors.set(CONFIG_FILE_PATH, new Error("access denied by mount rights"));

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: true });
  });

  it("reads valid JSON that is not an object as empty", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, `["plan"]`);

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: false });
  });

  it("writes a map to a pretty-printed file", async () => {
    // Arrange
    const { files, config } = configHarness();

    // Act
    await config.writeFile({ "advisor.model": "gpt-x" });

    // Assert
    deepStrictEqual(files.writes, [{ path: CONFIG_FILE_PATH, content: `{\n  "advisor.model": "gpt-x"\n}\n` }]);
  });

  it("reads back a map written to the file", async () => {
    // Arrange
    const { config } = configHarness();
    await config.writeFile({ "advisor.model": "gpt-x" });

    // Act
    const read = await config.readFile();

    // Assert
    deepStrictEqual(read, { map: { "advisor.model": "gpt-x" }, malformed: false });
  });
});

describe("config store — the session layer", () => {
  it("reads an empty session as {}", async () => {
    // Arrange
    const { config } = configHarness();

    // Act
    const map = await config.readSession();

    // Assert
    deepStrictEqual(map, {});
  });

  it("writes the session map to the state bag", async () => {
    // Arrange
    const { session, config } = configHarness();

    // Act
    await config.writeSession({ "review.lenses": "security" });

    // Assert
    strictEqual(session.state.get(CONFIG_MAP_STATE_KEY), `{"review.lenses":"security"}`);
  });

  it("reads back the session map written", async () => {
    // Arrange
    const { config } = configHarness();
    await config.writeSession({ "review.lenses": "security" });

    // Act
    const map = await config.readSession();

    // Assert
    deepStrictEqual(map, { "review.lenses": "security" });
  });

  it("reads a malformed session map as {}", async () => {
    // Arrange
    const { session, config } = configHarness();
    session.state.set(CONFIG_MAP_STATE_KEY, "{oops");

    // Act
    const map = await config.readSession();

    // Assert
    deepStrictEqual(map, {});
  });

  it("reads {} when the session store is unavailable", async () => {
    // Arrange
    const { session, config } = configHarness();
    session.failure = new Error("no session_store tool");

    // Act
    const map = await config.readSession();

    // Assert
    deepStrictEqual(map, {});
  });
});

describe("config store — layered reads", () => {
  it("leaves every key of the view unset when both layers are empty", async () => {
    // Arrange
    const { config } = configHarness();

    // Act
    const view = await config.readView();

    // Assert
    ok(view.entries.length > 0);
    ok(view.entries.every((e) => e.source === "unset" && e.value === undefined));
    deepStrictEqual(view.unknown, []);
    strictEqual(view.fileMalformed, false);
  });

  it("reads a key as unset when both layers are empty", async () => {
    // Arrange
    const { config } = configHarness();

    // Act
    const value = await config.readValue("permissions.fallback");

    // Assert
    deepStrictEqual(value, { key: "permissions.fallback", value: undefined, source: "unset" });
  });

  it("lets the session override the file", async () => {
    // Arrange
    const { config } = sessionOverFile();

    // Act
    const value = await config.readValue("permissions.fallback");

    // Assert
    deepStrictEqual(value, { key: "permissions.fallback", value: "acceptEdits", source: "session" });
  });

  it("reads from the file a key the session does not override", async () => {
    // Arrange
    const { config } = sessionOverFile();

    // Act
    const value = await config.readValue("review.lenses");

    // Assert
    deepStrictEqual(value, { key: "review.lenses", value: "style", source: "file" });
  });

  it("reports the unknown keys of both layers, sorted and once", async () => {
    // Arrange
    const { files, session, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ zeta: "1", alpha: "2" }));
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ alpha: "3" }));

    // Act
    const view = await config.readView();

    // Assert
    deepStrictEqual(view.unknown, ["alpha", "zeta"]);
  });
});

describe("config store — the user settings, which the project cannot widen", () => {
  it("reads the user file the launcher mounts read-only, outside the project", () => {
    // Arrange
    const project = `${WORKSPACE}/`;

    // Act
    const inProject = USER_CONFIG_FILE_PATH.startsWith(project);

    // Assert
    ok(!inProject, USER_CONFIG_FILE_PATH);
  });

  it("keeps the user's mode when the project file sets bypassPermissions, and names the value set aside", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "acceptEdits" }));

    // Act
    const r = await config.readValue("permissions.fallback");

    // Assert
    strictEqual(r.value, "acceptEdits");
    strictEqual(r.source, "user");
    strictEqual(r.ignored?.value, "bypassPermissions");
  });

  it("offers a project's extra tool only when the user file lists it", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues, deploy_prod" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues:read" }));

    // Act
    const r = await config.readValue("tools.extra");

    // Assert
    strictEqual(r.value, "search_issues:write");
    strictEqual(r.ignored?.value, "deploy_prod:write");
  });

  it("reads an absent user file as an empty layer: no project value widens", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));

    // Act
    const view = await config.readView();

    // Assert
    strictEqual(view.userMalformed, false);
    strictEqual(view.entries.find((e) => e.key === "permissions.fallback")?.source, "unset");
  });

  it("flags a malformed user file and reads nothing from it", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(USER_CONFIG_FILE_PATH, `{ "permissions.fallback": `);

    // Act
    const view = await config.readView();

    // Assert
    strictEqual(view.userMalformed, true);
    strictEqual(view.fileMalformed, false);
    ok(view.entries.every((e) => e.source === "unset"));
  });

  it("reads a user file that fails to read (no mount, an older launcher) as absent", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.readErrors.set(USER_CONFIG_FILE_PATH, new Error("no mount for the path"));

    // Act
    const read = await config.readUserFile();

    // Assert
    deepStrictEqual(read, { map: {}, malformed: false });
  });

  it("reports the unknown keys of the user file too", async () => {
    // Arrange
    const { files, config } = configHarness();
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "old.key": "1" }));

    // Act
    const view = await config.readView();

    // Assert
    deepStrictEqual(view.unknown, ["old.key"]);
  });

  it("never writes the user file: /config writes the project file", async () => {
    // Arrange
    const { files, config } = configHarness();

    // Act
    await config.writeFile({ "advisor.model": "m" });

    // Assert
    deepStrictEqual(files.writes.map((w) => w.path), [CONFIG_FILE_PATH]);
  });
});
