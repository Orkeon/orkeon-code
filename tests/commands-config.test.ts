// /config (commands/_lib/config.ts) over a config store on FakeFiles and
// FakeSessionStore: every sub-command, its refusals and its usage lines. Run:
//   node --test tests/commands-config.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { CONFIG_USAGE, runConfig } from "../src/commands/_lib/config.ts";
import { CONFIG_FILE_PATH, createConfigStore } from "../src/shared/application/config-store.ts";
import { CONFIG_KEYS, configKeySpec, knownConfigKeys } from "../src/shared/domain/config-schema.ts";
import { CONFIG_MAP_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";

const KEY = "advisor.model";

function setup() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const deps = { config: createConfigStore({ files, session: store }) };
  const run = (...tokens: string[]) => runConfig(tokens, deps);
  const fileMap = () => JSON.parse(files.files.get(CONFIG_FILE_PATH) ?? "{}");
  const sessionMap = () => JSON.parse(store.state.get(CONFIG_MAP_STATE_KEY) ?? "{}");
  return { files, store, run, fileMap, sessionMap };
}

describe("/config list", () => {
  it("tables every declared key with its layer, and names the file (the default sub-command)", async () => {
    const { files, store, run } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ [KEY]: "file-model" }));
    store.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "review.lenses": "security" }));
    const view = await run();
    deepStrictEqual(view.table, CONFIG_KEYS.map((s) => ({
      key: s.key,
      value: s.key === KEY ? "file-model" : s.key === "review.lenses" ? "security" : "(unset)",
      source: s.key === KEY ? "file" : s.key === "review.lenses" ? "session" : "unset",
    })));
    strictEqual(view.text, `file: ${CONFIG_FILE_PATH} — session overrides it until /reset-session.`);
    deepStrictEqual(await run("list"), view);
  });

  it("reports stored keys outside the key space, and a file it could not parse", async () => {
    const { files, store, run } = setup();
    store.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ legacy: "x" }));
    files.files.set(CONFIG_FILE_PATH, "{ not json");
    const lines = (await run("list")).text!.split("\n");
    strictEqual(lines[1], "⚠ stored but NOT in the key space (pre-B-6 residue, nothing reads them): legacy");
    strictEqual(lines[2], `⚠ ${CONFIG_FILE_PATH} could not be parsed — it is left untouched; fix or delete it.`);
  });
});

describe("/config keys", () => {
  it("tables the key space with the allowed values and the consumer of each key", async () => {
    const { run } = setup();
    const view = await run("keys");
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
    deepStrictEqual(await setup().run("get"), { text: "usage: /config get <key>" });
  });

  it("refuses an unknown key with the valid ones", async () => {
    deepStrictEqual(await setup().run("get", "nope"), {
      text: `unknown config key 'nope'. Valid keys: ${knownConfigKeys().join(", ")}`,
    });
  });

  it("says an unset key is unset, with what it does", async () => {
    deepStrictEqual(await setup().run("get", KEY), { text: `${KEY} is unset (${configKeySpec(KEY)!.description})` });
  });

  it("gives the effective value and its layer", async () => {
    const { store, run } = setup();
    store.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ [KEY]: "m1" }));
    deepStrictEqual(await run("get", KEY), { text: `${KEY} = m1  [session]` });
  });
});

describe("/config set", () => {
  it("writes the file by default, pretty-printed", async () => {
    const { files, run, fileMap } = setup();
    deepStrictEqual(await run("set", KEY, "big", "model"), { text: `${KEY} = big model [file] — persisted in ${CONFIG_FILE_PATH}.` });
    deepStrictEqual(fileMap(), { [KEY]: "big model" });
    strictEqual(files.files.get(CONFIG_FILE_PATH), `${JSON.stringify({ [KEY]: "big model" }, null, 2)}\n`);
  });

  it("writes the session layer with --session, wherever the flag sits", async () => {
    const { files, run, sessionMap } = setup();
    deepStrictEqual(await run("set", KEY, "--session", "m2"), {
      text: `${KEY} = m2 [session] — overrides the file until /reset-session.`,
    });
    deepStrictEqual(sessionMap(), { [KEY]: "m2" });
    deepStrictEqual(files.writes, []);
  });

  it("refuses an unknown key with the list, and an invalid value with the allowed set", async () => {
    const { files, run } = setup();
    ok((await run("set", "permissions.fallbck", "plan")).text!.startsWith("unknown config key 'permissions.fallbck'. Valid keys: "));
    deepStrictEqual(await run("set", "commit.requireConfirm", "maybe"), {
      text: "'maybe' is not valid for 'commit.requireConfirm'. Allowed: true, false",
    });
    deepStrictEqual(await run("set", KEY), { text: `'${KEY}' needs a value.` });
    deepStrictEqual(files.writes, []);
  });

  it("refuses to write over a file it could not parse", async () => {
    const { files, run } = setup();
    files.files.set(CONFIG_FILE_PATH, "{ not json");
    deepStrictEqual(await run("set", KEY, "m"), {
      text: `refusing to write: ${CONFIG_FILE_PATH} exists but could not be parsed, and overwriting it ` +
        "would discard whatever it holds. Fix or delete it, then retry.",
    });
    deepStrictEqual(files.writes, []);
  });
});

describe("/config unset", () => {
  it("asks for a key", async () => {
    deepStrictEqual(await setup().run("unset"), { text: "usage: /config unset [--session] <key>" });
  });

  it("removes a file value, and says when there is none", async () => {
    const { files, run, fileMap } = setup();
    deepStrictEqual(await run("unset", KEY), { text: `${KEY} is not set in ${CONFIG_FILE_PATH}.` });
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ [KEY]: "m", "review.lenses": "style" }));
    deepStrictEqual(await run("unset", KEY), { text: `${KEY} removed from ${CONFIG_FILE_PATH}.` });
    deepStrictEqual(fileMap(), { "review.lenses": "style" });
  });

  it("removes a session override, and says when there is none", async () => {
    const { store, run, sessionMap } = setup();
    deepStrictEqual(await run("unset", "--session", KEY), { text: `${KEY} has no session override.` });
    store.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ [KEY]: "m" }));
    deepStrictEqual(await run("unset", "--session", KEY), {
      text: `${KEY} session override removed (the file value applies again).`,
    });
    deepStrictEqual(sessionMap(), {});
  });

  it("refuses to write over a file it could not parse", async () => {
    const { files, run } = setup();
    files.files.set(CONFIG_FILE_PATH, "{ not json");
    deepStrictEqual(await run("unset", KEY), { text: `refusing to write: ${CONFIG_FILE_PATH} could not be parsed.` });
    deepStrictEqual(files.writes, []);
  });
});

describe("/config — anything else", () => {
  it("answers the usage line", async () => {
    deepStrictEqual(await setup().run("frobnicate"), { text: CONFIG_USAGE });
  });
});
