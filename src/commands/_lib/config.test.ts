// /config (commands/_lib/config.ts) over a config store on FakeFiles and
// FakeSessionStore: every sub-command, its refusals and its usage lines. Run:
//   node --test src/commands/_lib/config.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { CONFIG_USAGE } from "./config.ts";
import { CONFIG_FILE_PATH } from "../../shared/application/config-store.ts";
import { CONFIG_KEYS, configKeySpec, knownConfigKeys } from "../../shared/domain/config-schema.ts";
import {
  BYPASS_IGNORED,
  KEY,
  LAYERED_SEED,
  LIST_TEXT,
  MALFORMED_REFUSAL,
  NARROW_USER_SETTINGS,
  NESTED_WARNING,
  NOT_JSON,
  SET_REFUSAL_CASES,
  UNLISTED_TOOL_NOTE,
  UNNARROWED_SET_CASES,
  UNPARSED_USER_SETTINGS_NOTE,
  WIDER_FALLBACK_NOTE,
  configHarness,
  layeredTable,
} from "./config.fixtures.ts";

describe("/config list", () => {
  it("tables every declared key with its layer, and names the file (the default sub-command)", async () => {
    // Arrange
    const { run } = configHarness(LAYERED_SEED);

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view.table, layeredTable());
    strictEqual(view.text, LIST_TEXT);
  });

  it("answers `list` with the same table and text as the default sub-command", async () => {
    // Arrange
    const { run } = configHarness(LAYERED_SEED);

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, { table: layeredTable(), text: LIST_TEXT });
  });

  it("reports stored keys outside the key space, and a file it could not parse", async () => {
    // Arrange
    const { run } = configHarness({ session: { legacy: "x" }, file: NOT_JSON });

    // Act
    const lines = (await run("list")).text!.split("\n");

    // Assert
    strictEqual(lines[1], "⚠ stored but NOT in the key space (pre-B-6 residue, nothing reads them): legacy");
    strictEqual(lines[2], `⚠ ${CONFIG_FILE_PATH} could not be parsed — it is left untouched; fix or delete it.`);
  });

  it("names a known key written nested, with the flat spelling", async () => {
    // Arrange
    const { run } = configHarness({ file: { permissions: { fallback: "plan" } } });

    // Act
    const lines = (await run("list")).text!.split("\n");

    // Assert
    ok(lines.includes(NESTED_WARNING), lines.join("\n"));
  });
});

describe("/config keys", () => {
  it("tables the key space with the allowed values and the consumer of each key", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("keys");

    // Assert
    strictEqual(view.table!.length, CONFIG_KEYS.length);
    deepStrictEqual(view.table![CONFIG_KEYS.findIndex((s) => s.key === KEY)], {
      key: KEY, allowed: "(any)", "read by": configKeySpec(KEY)!.consumedBy,
    });
    deepStrictEqual(view.table![CONFIG_KEYS.findIndex((s) => s.key === "commit.requireConfirm")], {
      key: "commit.requireConfirm", allowed: "true | false", "read by": "/commit",
    });
    strictEqual(view.text, "every key names its consumer — a key nothing reads is not settable.");
  });
});

describe("/config get", () => {
  it("asks for a key", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("get");

    // Assert
    deepStrictEqual(view, { text: "usage: /config get <key>" });
  });

  it("refuses an unknown key with the valid ones", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("get", "nope");

    // Assert
    deepStrictEqual(view, { text: `unknown config key 'nope'. Valid keys: ${knownConfigKeys().join(", ")}` });
  });

  it("says an unset key is unset, with what it does", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("get", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} is unset (${configKeySpec(KEY)!.description})` });
  });

  it("gives the effective value and its layer", async () => {
    // Arrange
    const { run } = configHarness({ session: { [KEY]: "m1" } });

    // Act
    const view = await run("get", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} = m1  [session]` });
  });
});

describe("/config set", () => {
  it("writes the file by default, pretty-printed", async () => {
    // Arrange
    const { files, run, fileMap } = configHarness();

    // Act
    const view = await run("set", KEY, "big", "model");

    // Assert
    deepStrictEqual(view, { text: `${KEY} = big model [file] — persisted in ${CONFIG_FILE_PATH}.` });
    deepStrictEqual(fileMap(), { [KEY]: "big model" });
    strictEqual(files.files.get(CONFIG_FILE_PATH), `${JSON.stringify({ [KEY]: "big model" }, null, 2)}\n`);
  });

  it("writes the session layer with --session, wherever the flag sits", async () => {
    // Arrange
    const { files, run, sessionMap } = configHarness();

    // Act
    const view = await run("set", KEY, "--session", "m2");

    // Assert
    deepStrictEqual(view, { text: `${KEY} = m2 [session] — overrides the file until /clear.` });
    deepStrictEqual(sessionMap(), { [KEY]: "m2" });
    deepStrictEqual(files.writes, []);
  });

  it("refuses an unknown key with the list, and writes nothing", async () => {
    // Arrange
    const { files, run } = configHarness();

    // Act
    const view = await run("set", "permissions.fallbck", "plan");

    // Assert
    ok(view.text!.startsWith("unknown config key 'permissions.fallbck'. Valid keys: "));
    deepStrictEqual(files.writes, []);
  });

  for (const c of SET_REFUSAL_CASES) {
    it(`${c.name}, and writes nothing`, async () => {
      // Arrange
      const { files, run } = configHarness();

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(files.writes, []);
    });
  }

  it("refuses to write over a file it could not parse", async () => {
    // Arrange
    const { files, run } = configHarness({ file: NOT_JSON });

    // Act
    const view = await run("set", KEY, "m");

    // Assert
    deepStrictEqual(view, { text: MALFORMED_REFUSAL });
    deepStrictEqual(files.writes, []);
  });
});

describe("/config set of a key the user settings narrow", () => {
  it("still writes a fallback a project file may not set, then says it is ignored and where it goes", async () => {
    // Arrange
    const { run, fileMap } = configHarness();

    // Act
    const view = await run("set", "permissions.fallback", "bypassPermissions");

    // Assert
    deepStrictEqual(view, { text: BYPASS_IGNORED });
    deepStrictEqual(fileMap(), { "permissions.fallback": "bypassPermissions" });
  });

  it("still writes a fallback wider than the user's, and says it is ignored", async () => {
    // Arrange
    const { run, fileMap } = configHarness({ user: NARROW_USER_SETTINGS });

    // Act
    const fallback = (await run("set", "permissions.fallback", "acceptEdits")).text!;

    // Assert
    ok(fallback.endsWith(WIDER_FALLBACK_NOTE), fallback);
    deepStrictEqual(fileMap(), { "permissions.fallback": "acceptEdits" });
  });

  it("still writes extra tools the user settings do not list, and says the unlisted one is ignored", async () => {
    // Arrange
    const { run, fileMap } = configHarness({ user: NARROW_USER_SETTINGS });

    // Act
    const tools = (await run("set", "tools.extra", "search_issues, deploy_prod")).text!;

    // Assert
    ok(tools.endsWith(UNLISTED_TOOL_NOTE), tools);
    deepStrictEqual(fileMap(), { "tools.extra": "search_issues, deploy_prod" });
  });

  it("says when the user settings could not be parsed, so that none applies", async () => {
    // Arrange
    const { run } = configHarness({ user: NOT_JSON });

    // Act
    const text = (await run("set", "tools.extra", "deploy_prod")).text!;

    // Assert
    ok(text.endsWith(UNPARSED_USER_SETTINGS_NOTE), text);
  });

  for (const c of UNNARROWED_SET_CASES) {
    it(c.name, async () => {
      // Arrange
      const { run } = configHarness();

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
    });
  }
});

describe("/config unset", () => {
  it("asks for a key", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("unset");

    // Assert
    deepStrictEqual(view, { text: "usage: /config unset [--session] <key>" });
  });

  it("says when the file holds no value for the key", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("unset", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} is not set in ${CONFIG_FILE_PATH}.` });
  });

  it("removes a file value", async () => {
    // Arrange
    const { run, fileMap } = configHarness({ file: { [KEY]: "m", "review.lenses": "style" } });

    // Act
    const view = await run("unset", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} removed from ${CONFIG_FILE_PATH}.` });
    deepStrictEqual(fileMap(), { "review.lenses": "style" });
  });

  it("says when there is no session override", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("unset", "--session", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} has no session override.` });
  });

  it("removes a session override", async () => {
    // Arrange
    const { run, sessionMap } = configHarness({ session: { [KEY]: "m" } });

    // Act
    const view = await run("unset", "--session", KEY);

    // Assert
    deepStrictEqual(view, { text: `${KEY} session override removed (the file value applies again).` });
    deepStrictEqual(sessionMap(), {});
  });

  it("refuses to write over a file it could not parse", async () => {
    // Arrange
    const { files, run } = configHarness({ file: NOT_JSON });

    // Act
    const view = await run("unset", KEY);

    // Assert
    deepStrictEqual(view, { text: `refusing to write: ${CONFIG_FILE_PATH} could not be parsed.` });
    deepStrictEqual(files.writes, []);
  });
});

describe("/config — anything else", () => {
  it("answers the usage line", async () => {
    // Arrange
    const { run } = configHarness();

    // Act
    const view = await run("frobnicate");

    // Assert
    deepStrictEqual(view, { text: CONFIG_USAGE });
  });
});
