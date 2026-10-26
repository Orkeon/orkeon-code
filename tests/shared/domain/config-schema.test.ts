// B-6 — the /config key space and its two layers. Run:
//   node --test tests/shared/domain/config-schema.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";
import {
  CONFIG_KEYS, configKeySpec, isKnownConfigKey, knownConfigKeys,
  validateConfigEntry, layerConfig, resolveConfigEntry, unknownStoredKeys, nestedConfigKeys,
} from "../../../src/shared/domain/config-schema.ts";
import { PERMISSION_MODES } from "../../../src/shared/domain/permission-modes.ts";
import {
  BLANK_VALUES, CLEAN_MAPS, CONSUMERS, FALLBACK_AGAINST_USER, MEMORY_VALUES, NESTED_MAP, NON_STRING_VALUES,
  NOT_NESTED_MAPS, PROJECT_MODES, READ_ONLY_TOOLS, REFUSED_MEMORY_DIRS, TOOLS_EXTRA_REFUSAL, TWIN_ENTRIES,
  UNDECLARED_MEMORY_KEYS, USER_GATED_KEYS, VALID_MEMORY_DIRS, VALID_TOOLS_EXTRA, WIDER_PROJECT_MODES,
} from "./config-schema.fixtures.ts";
import { assertUserFacingConsumer } from "./config-schema.assertions.ts";
import { assertMentions } from "../../support/assertions/text.ts";

describe("the key space itself", () => {
  for (const spec of CONFIG_KEYS) {
    it(`declares a consumer for every key — a key nothing reads is not settable: ${spec.key}`, () => {
      // Arrange
      const { key } = spec;

      // Act
      const lengths = { consumedBy: spec.consumedBy.length, description: spec.description.length };

      // Assert
      ok(lengths.consumedBy > 0, key);
      ok(lengths.description > 0, key);
    });
  }

  for (const spec of CONFIG_KEYS) {
    it(`names each consumer as the user meets it: a command or the host, never a source file: ${spec.key}`, () => {
      // `/config list` prints it as "read by": a path like crews/advisor/crew.ork.ts
      // went stale as soon as the code moved, and told the user nothing.
      // Arrange
      const { key } = spec;

      // Act
      const consumer = spec.consumedBy;

      // Assert
      assertUserFacingConsumer(key, consumer);
    });
  }

  it("names the consumers of every key", () => {
    // Arrange
    const specs = CONFIG_KEYS;

    // Act
    const consumers = Object.fromEntries(specs.map((s) => [s.key, s.consumedBy]));

    // Assert
    deepStrictEqual(consumers, CONSUMERS);
  });

  it("has no duplicate keys", () => {
    // Arrange
    const keys = knownConfigKeys();

    // Act
    const distinct = new Set(keys).size;

    // Assert
    strictEqual(distinct, CONFIG_KEYS.length);
  });

  it("carries permissions.fallback, and its allowed set IS the mode vocabulary", () => {
    // B-2 reads this key to decide the session's permission posture. If the two
    // lists drifted, /config would accept a mode the resolver then rejects — and
    // the operator would be told their posture changed when it had not.
    // Arrange
    const key = "permissions.fallback";

    // Act
    const spec = configKeySpec(key);

    // Assert
    ok(spec, "permissions.fallback must be settable");
    deepStrictEqual([...spec!.allowed!].sort(), [...PERMISSION_MODES].sort());
  });

  it("carries spinnerVerbs as a free-form CSV consumed by the host TUI", () => {
    // The host reads this key OUTSIDE the script runtime (TuiFidelityWiring polls
    // the config_map session state and the settings file directly), so its exact
    // name is a cross-layer contract — renaming it here silently kills the setting.
    // Arrange
    const key = "spinnerVerbs";

    // Act
    const spec = configKeySpec(key);

    // Assert
    ok(spec, "spinnerVerbs must be settable");
    strictEqual(spec!.allowed, undefined); // any non-empty CSV of verbs
    ok(spec!.consumedBy.includes("TUI"), spec!.consumedBy);
  });

  it("accepts a CSV of verbs as spinnerVerbs", () => {
    // Arrange
    const verbs = "Reticulating, Percolating";

    // Act
    const v = validateConfigEntry("spinnerVerbs", verbs);

    // Assert
    ok(v.ok);
  });
});

describe("validateConfigEntry — ACCEPTANCE 1: unknown keys are rejected with the list", () => {
  it("names every valid key in the rejection", () => {
    // Arrange
    const key = "permissions.fallbck";

    // Act
    const v = validateConfigEntry(key, "plan");

    // Assert
    strictEqual(v.ok, false);
    assertMentions(v.reason, knownConfigKeys());
  });

  it("rejects a value outside the key's allowed set, naming the set", () => {
    // Arrange
    const value = "yolo";

    // Act
    const v = validateConfigEntry("permissions.fallback", value);

    // Assert
    strictEqual(v.ok, false);
    assertMentions(v.reason, ["bypassPermissions", "yolo"]);
  });

  for (const mode of PERMISSION_MODES) {
    it(`accepts every allowed value of a constrained key: ${mode}`, () => {
      // Arrange
      const value = mode;

      // Act
      const v = validateConfigEntry("permissions.fallback", value);

      // Assert
      strictEqual(v.ok, true, mode);
    });
  }

  it("accepts any non-empty value for an unconstrained key", () => {
    // Arrange
    const value = "correctness,security";

    // Act
    const v = validateConfigEntry("review.lenses", value);

    // Assert
    strictEqual(v.ok, true);
  });

  for (const value of BLANK_VALUES) {
    it(`rejects an empty value rather than storing a blank setting: ${JSON.stringify(value)}`, () => {
      // Arrange
      const blank = value;

      // Act
      const v = validateConfigEntry("review.lenses", blank);

      // Assert
      strictEqual(v.ok, false);
    });
  }

  for (const value of VALID_TOOLS_EXTRA) {
    it(`checks the notation of tools.extra, accepting ${JSON.stringify(value)}`, () => {
      // Arrange
      const extra = value;

      // Act
      const v = validateConfigEntry("tools.extra", extra);

      // Assert
      strictEqual(v.ok, true);
    });
  }

  it("checks the notation of tools.extra, naming the entries it refuses", () => {
    // Arrange
    const extra = "a:read, b:exec, file_write:read, a";

    // Act
    const v = validateConfigEntry("tools.extra", extra);

    // Assert
    strictEqual(v.ok, false);
    strictEqual(v.reason, TOOLS_EXTRA_REFUSAL);
  });

  it("refuses a tools.extra that names no tool", () => {
    // Arrange
    const extra = ", ,";

    // Act
    const v = validateConfigEntry("tools.extra", extra);

    // Assert
    strictEqual(v.reason, "', ,' is not valid for 'tools.extra': it names no tool");
  });

  it("is not fooled by a nullish key", () => {
    // Arrange
    const key = undefined;

    // Act
    const v = validateConfigEntry(key, "x");

    // Assert
    strictEqual(v.ok, false);
  });

  it("knows no null key", () => {
    // Arrange
    const key = null;

    // Act
    const known = isKnownConfigKey(key);

    // Assert
    strictEqual(known, false);
  });
});

describe("layerConfig — ACCEPTANCE 2 & 3: session over file", () => {
  it("returns the file value when the session has none", () => {
    // Arrange
    const file = { "permissions.fallback": "plan" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", file, {}, {});

    // Assert
    strictEqual(r.value, "plan");
    strictEqual(r.source, "file");
  });

  it("lets a session override win", () => {
    // Arrange
    const file = { "permissions.fallback": "plan" };
    const session = { "permissions.fallback": "bypassPermissions" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", file, session, {});

    // Assert
    strictEqual(r.value, "bypassPermissions");
    strictEqual(r.source, "session");
  });

  it("ACCEPTANCE 3 — the session layer shadows the file value while it holds one", () => {
    // Arrange
    const file = { "permissions.fallback": "plan" };

    // Act
    const before = resolveConfigEntry("permissions.fallback", file, { "permissions.fallback": "dontAsk" }, {});

    // Assert
    strictEqual(before.value, "dontAsk");
  });

  it("ACCEPTANCE 3 — dropping the session layer restores the file value", () => {
    // What /clear does: the bag goes, the file stays.
    // Arrange
    const file = { "permissions.fallback": "plan" };

    // Act
    const after = resolveConfigEntry("permissions.fallback", file, {}, {});

    // Assert
    strictEqual(after.value, "plan");
    strictEqual(after.source, "file");
  });

  it("reports unset when neither layer has it", () => {
    // Arrange
    const file = {};

    // Act
    const r = resolveConfigEntry("permissions.fallback", file, {}, {});

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
  });

  it("treats a blank stored value as unset in the session layer", () => {
    // A blank cannot mean "override with nothing": it would shadow the file with
    // an absence, which no /config path can produce and no consumer can read.
    // Arrange
    const session = { "review.lenses": "  " };

    // Act
    const r = resolveConfigEntry("review.lenses", { "review.lenses": "a" }, session, {});

    // Assert
    strictEqual(r.value, "a");
  });

  it("treats a blank stored value as unset in the file layer", () => {
    // Arrange
    const file = { "review.lenses": "  " };

    // Act
    const r = resolveConfigEntry("review.lenses", file, {}, {});

    // Assert
    strictEqual(r.source, "unset");
  });

  for (const junk of NON_STRING_VALUES) {
    it(`ignores non-string stored values instead of coercing them: ${String(junk)}`, () => {
      // Arrange
      const file = { "review.lenses": junk };

      // Act
      const r = resolveConfigEntry("review.lenses", file, {}, {});

      // Assert
      strictEqual(r.source, "unset", String(junk));
    });
  }

  it("returns one entry per declared key, and only declared keys", () => {
    // Arrange
    const file = { "not.a.key": "x" };

    // Act
    const entries = layerConfig(file, { "also.not": "y" }, { "nor.this": "z" });

    // Assert
    deepStrictEqual(entries.map((e) => e.key), knownConfigKeys());
  });

  it("tolerates null/undefined maps", () => {
    // Arrange
    const file = null;

    // Act
    const entries = layerConfig(file, undefined, null);

    // Assert
    strictEqual(entries.length, CONFIG_KEYS.length);
  });
});

describe("unknownStoredKeys", () => {
  it("reports pre-schema residue rather than hiding it", () => {
    // The map was free-form before B-6, so real sessions hold keys nothing reads.
    // They are reported and NOT deleted: silently dropping someone's data on the
    // next write is how a schema migration loses it.
    // Arrange
    const map = { "old.key": "v", "permissions.fallback": "plan", "z.key": "w" };

    // Act
    const unknown = unknownStoredKeys(map);

    // Assert
    deepStrictEqual(unknown, ["old.key", "z.key"]);
  });

  for (const c of CLEAN_MAPS) {
    it(`is empty for a clean map: ${c.name}`, () => {
      // Arrange
      const { map } = c;

      // Act
      const unknown = unknownStoredKeys(map);

      // Assert
      deepStrictEqual(unknown, []);
    });
  }
});

describe("nestedConfigKeys", () => {
  it("names the known keys written nested, in their flat spelling", () => {
    // Arrange
    const map = NESTED_MAP;

    // Act
    const nested = nestedConfigKeys(map);

    // Assert
    deepStrictEqual(nested, ["permissions.fallback", "tools.extra"]);
  });

  for (const c of NOT_NESTED_MAPS) {
    it(`is empty for a flat map, a scalar residue and no map: ${c.name}`, () => {
      // Arrange
      const { map } = c;

      // Act
      const nested = nestedConfigKeys(map);

      // Assert
      deepStrictEqual(nested, []);
    });
  }
});

describe("the user layer: a project file widens nothing (QL-06)", () => {
  it("reads a key the project leaves unset from the user layer", () => {
    // Arrange
    const user = { "permissions.fallback": "bypassPermissions" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", {}, {}, user);

    // Assert
    deepStrictEqual(r, { key: "permissions.fallback", value: "bypassPermissions", source: "user" });
  });

  for (const mode of PROJECT_MODES) {
    it(`lets the project set default, plan or acceptEdits over the user's mode: ${mode}`, () => {
      // Arrange
      const file = { "permissions.fallback": mode };

      // Act
      const r = resolveConfigEntry("permissions.fallback", file, {}, { "permissions.fallback": "bypassPermissions" });

      // Assert
      deepStrictEqual(r, { key: "permissions.fallback", value: mode, source: "file" }, mode);
    });
  }

  for (const mode of WIDER_PROJECT_MODES) {
    it(`ignores a wider mode from the project, keeps the user's, and names the value set aside: ${mode}`, () => {
      // Arrange
      const file = { "permissions.fallback": ` ${mode} ` };

      // Act
      const r = resolveConfigEntry("permissions.fallback", file, {}, { "permissions.fallback": "plan" });

      // Assert
      strictEqual(r.value, "plan", mode);
      strictEqual(r.source, "user", mode);
      strictEqual(r.ignored?.value, mode, mode);
      ok(r.ignored?.reason.includes("default, plan or acceptEdits"), r.ignored?.reason);
    });
  }

  it("never lets the project set a mode wider than the one the user settings set", () => {
    // Arrange
    const file = { "permissions.fallback": "acceptEdits" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", file, {}, { "permissions.fallback": "plan" });

    // Assert
    strictEqual(r.value, "plan");
    strictEqual(r.source, "user");
    strictEqual(r.ignored?.value, "acceptEdits");
    ok(r.ignored?.reason.includes("wider than the user settings' 'plan'"), r.ignored?.reason);
  });

  for (const c of FALLBACK_AGAINST_USER) {
    it(`never lets the project set a mode wider than the one the user settings set: ${c.name}`, () => {
      // Arrange
      const { file, user } = c;

      // Act
      const r = resolveConfigEntry("permissions.fallback", file, {}, user);

      // Assert
      strictEqual(r.value, c.value);
    });
  }

  it("leaves the fallback unset when the project's wide value is ignored and the user sets none", () => {
    // Arrange
    const file = { "permissions.fallback": "bypassPermissions" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", file, {}, {});

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
    strictEqual(r.ignored?.value, "bypassPermissions");
  });

  it("lets the session set any mode: the user types it in the REPL, as /mode", () => {
    // Arrange
    const session = { "permissions.fallback": "dontAsk" };

    // Act
    const r = resolveConfigEntry("permissions.fallback", { "permissions.fallback": "bypassPermissions" }, session, {});

    // Assert
    deepStrictEqual(r, { key: "permissions.fallback", value: "dontAsk", source: "session" });
  });

  it("offers a project's extra tool only when the user lists it, and names the others", () => {
    // Arrange
    const file = { "tools.extra": "search_issues, deploy_prod" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, { "tools.extra": "Search_Issues:write" });

    // Assert
    strictEqual(r.value, "search_issues:write");
    strictEqual(r.source, "file");
    strictEqual(r.ignored?.value, "deploy_prod:write");
  });

  for (const c of READ_ONLY_TOOLS) {
    it(`keeps a tool read only when both lists say read: a read tool is offered in plan and dontAsk too — ${c.name}`, () => {
      // Arrange
      const { file, user } = c;

      // Act
      const r = resolveConfigEntry("tools.extra", file, {}, user);

      // Assert
      strictEqual(r.value, c.value);
    });
  }

  it("accepts every project tool when the user lists *, as write: * grants the tools, not their class", () => {
    // Arrange
    const file = { "tools.extra": "a:read, b" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, { "tools.extra": "*" });

    // Assert
    deepStrictEqual(r, { key: "tools.extra", value: "a:write, b:write", source: "file" });
  });

  it("drops the second entry of a dropped tool: once its twin is gone, it would parse as a grant", () => {
    // Arrange
    const file = { "tools.extra": "evil_tool:write, evil_tool:read" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, {});

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.ignored?.value, "evil_tool:write");
  });

  for (const c of TWIN_ENTRIES) {
    it(`drops the second entry of a dropped tool: ${c.name}`, () => {
      // Arrange
      const { file, user } = c;

      // Act
      const r = resolveConfigEntry("tools.extra", file, {}, user);

      // Assert
      strictEqual(r.value, c.value);
    });
  }

  it("does not take *:read as *", () => {
    // Arrange
    const user = { "tools.extra": "*:read" };

    // Act
    const r = resolveConfigEntry("tools.extra", { "tools.extra": "a:read" }, {}, user);

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.ignored?.value, "a:read");
  });

  it("offers no tool when the project lists only tools the user does not: the user's list does not take over", () => {
    // Arrange
    const file = { "tools.extra": "deploy_prod" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, { "tools.extra": "search_issues" });

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
    strictEqual(r.ignored?.value, "deploy_prod:write");
  });

  it("offers no project tool at all when the user layer is empty", () => {
    // Arrange
    const file = { "tools.extra": "search_issues" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, {});

    // Assert
    strictEqual(r.value, undefined);
    strictEqual(r.ignored?.value, "search_issues:write");
  });

  it("takes the user's list, less *, when the project sets none", () => {
    // Arrange
    const user = { "tools.extra": "*, search_issues:read" };

    // Act
    const r = resolveConfigEntry("tools.extra", {}, {}, user);

    // Assert
    deepStrictEqual(r, { key: "tools.extra", value: "search_issues:read", source: "user" });
  });

  it("leaves tools.extra unset when the user lists * alone and the project sets none", () => {
    // Arrange
    const user = { "tools.extra": "*" };

    // Act
    const r = resolveConfigEntry("tools.extra", {}, {}, user);

    // Assert
    strictEqual(r.source, "unset");
  });

  it("keeps a project entry that does not parse, as written, for the reader to warn about", () => {
    // Arrange
    const file = { "tools.extra": "a:read, bad:exec" };

    // Act
    const r = resolveConfigEntry("tools.extra", file, {}, { "tools.extra": "*" });

    // Assert
    strictEqual(r.value, "a:write, bad:exec");
    strictEqual(r.ignored, undefined);
  });

  it("lets the session list any tool", () => {
    // Arrange
    const session = { "tools.extra": "deploy_prod" };

    // Act
    const r = resolveConfigEntry("tools.extra", { "tools.extra": "x" }, session, {});

    // Assert
    deepStrictEqual(r, { key: "tools.extra", value: "deploy_prod", source: "session" });
  });

  it("lets the project override the user on every other key", () => {
    // Arrange
    const file = { "review.lenses": "style" };

    // Act
    const r = resolveConfigEntry("review.lenses", file, {}, { "review.lenses": "security" });

    // Assert
    deepStrictEqual(r, { key: "review.lenses", value: "style", source: "file" });
  });

  it("reads another key the project leaves unset from the user layer", () => {
    // Arrange
    const user = { "advisor.model": "m" };

    // Act
    const entries = layerConfig({}, {}, user);

    // Assert
    strictEqual(entries.find((e) => e.key === "advisor.model")?.source, "user");
  });
});

describe("the shared memory's keys (M-2)", () => {
  for (const key of UNDECLARED_MEMORY_KEYS) {
    it(`refuses a memory.* key the schema does not declare, with the list: ${key}`, () => {
      // Arrange
      const undeclared = key;

      // Act
      const v = validateConfigEntry(undeclared, "x");

      // Assert
      strictEqual(v.ok, false, key);
      ok(v.reason.startsWith(`unknown config key '${key}'`), v.reason);
      assertMentions(v.reason, ["memory.dir, memory.project, memory.autoAdmitAudited"]);
    });
  }

  for (const dir of VALID_MEMORY_DIRS) {
    it(`takes a relative folder as memory.dir: ${dir}`, () => {
      // Arrange
      const value = dir;

      // Act
      const v = validateConfigEntry("memory.dir", value);

      // Assert
      ok(v.ok, dir);
    });
  }

  for (const c of REFUSED_MEMORY_DIRS) {
    it(`never takes one outside the project nor the agent memory's as memory.dir: ${c.dir}`, () => {
      // Arrange
      const { dir } = c;

      // Act
      const v = validateConfigEntry("memory.dir", dir);

      // Assert
      strictEqual(v.ok, false, dir);
      ok(v.reason.includes(c.why), `${dir}: ${v.reason}`);
    });
  }

  for (const c of MEMORY_VALUES) {
    it(`takes a kebab-case memory.project, and true or false as memory.autoAdmitAudited: ${c.key} = ${JSON.stringify(c.value)}`, () => {
      // Arrange
      const { key, value } = c;

      // Act
      const v = validateConfigEntry(key, value);

      // Assert
      strictEqual(v.ok, c.ok, value);
    });
  }

  for (const key of USER_GATED_KEYS) {
    it(`sets ${key} true from a project file only when the user settings do (QL-06)`, () => {
      // Arrange
      const file = { [key]: "true" };

      // Act
      const r = resolveConfigEntry(key, file, {}, {});

      // Assert
      strictEqual(r.value, undefined);
      strictEqual(r.source, "unset");
      strictEqual(r.ignored?.value, "true");
      ok(r.ignored?.reason.includes("user settings"), r.ignored?.reason);
    });

    it(`keeps the user's false for ${key} over a project's true (QL-06)`, () => {
      // Arrange
      const user = { [key]: "false" };

      // Act
      const r = resolveConfigEntry(key, { [key]: "true" }, {}, user);

      // Assert
      strictEqual(r.value, "false");
    });

    it(`sets ${key} true from a project file when the user settings do too (QL-06)`, () => {
      // Arrange
      const user = { [key]: "true" };

      // Act
      const r = resolveConfigEntry(key, { [key]: "true" }, {}, user);

      // Assert
      deepStrictEqual(r, { key, value: "true", source: "file" });
    });

    it(`lets a project file set ${key} false over the user's true (QL-06)`, () => {
      // Arrange
      const user = { [key]: "true" };

      // Act
      const r = resolveConfigEntry(key, { [key]: "false" }, {}, user);

      // Assert
      deepStrictEqual(r, { key, value: "false", source: "file" });
    });
  }
});
