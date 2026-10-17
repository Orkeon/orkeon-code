// B-6 — the /config key space and its two layers. Run:
//   node_modules/.bin/tsx --test shared/domain/config-schema.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";
import {
  CONFIG_KEYS, configKeySpec, isKnownConfigKey, knownConfigKeys,
  validateConfigEntry, layerConfig, resolveConfigEntry, unknownStoredKeys,
} from "./config-schema.ts";
import { PERMISSION_MODES } from "./permission-modes.ts";

describe("the key space itself", () => {
  it("declares a consumer for every key — a key nothing reads is not settable", () => {
    for (const spec of CONFIG_KEYS) {
      ok(spec.consumedBy.length > 0, spec.key);
      ok(spec.description.length > 0, spec.key);
    }
  });

  it("names each consumer as the user meets it: a command or the host, never a source file", () => {
    // `/config list` prints it as "read by": a path like crews/advisor/crew.ork.ts
    // went stale as soon as the code moved, and told the user nothing.
    for (const spec of CONFIG_KEYS) {
      ok(/^(\/[a-z-]+|the orkeon-repl )/.test(spec.consumedBy), `${spec.key}: ${spec.consumedBy}`);
      ok(!/\.ts\b|\b(crews|commands|shared)\//.test(spec.consumedBy), `${spec.key}: ${spec.consumedBy}`);
    }
    deepStrictEqual(Object.fromEntries(CONFIG_KEYS.map((s) => [s.key, s.consumedBy])), {
      "permissions.fallback": "/assistant (main-loop crew), /commit, /mode, /permissions",
      "review.lenses": "/review (code-review crew)",
      "advisor.model": "/advisor (advisor crew)",
      "commit.requireConfirm": "/commit",
      spinnerVerbs: "the orkeon-repl TUI status line (read by the host)",
      "tools.extra": "/assistant and /summary (the tools offered), /permissions (rules may name them)",
      "voice.reply": "/assistant, /summary, /transcribe --then, /voice send and /voice --go (each answer read aloud)",
    });
  });

  it("has no duplicate keys", () => {
    strictEqual(new Set(knownConfigKeys()).size, CONFIG_KEYS.length);
  });

  it("carries permissions.fallback, and its allowed set IS the mode vocabulary", () => {
    // B-2 reads this key to decide the session's permission posture. If the two
    // lists drifted, /config would accept a mode the resolver then rejects — and
    // the operator would be told their posture changed when it had not.
    const spec = configKeySpec("permissions.fallback");
    ok(spec, "permissions.fallback must be settable");
    deepStrictEqual([...spec!.allowed!].sort(), [...PERMISSION_MODES].sort());
  });

  it("carries spinnerVerbs as a free-form CSV consumed by the host TUI", () => {
    // The host reads this key OUTSIDE the script runtime (TuiFidelityWiring polls
    // the config_map session state and the settings file directly), so its exact
    // name is a cross-layer contract — renaming it here silently kills the setting.
    const spec = configKeySpec("spinnerVerbs");
    ok(spec, "spinnerVerbs must be settable");
    strictEqual(spec!.allowed, undefined); // any non-empty CSV of verbs
    ok(spec!.consumedBy.includes("TUI"), spec!.consumedBy);
    ok(validateConfigEntry("spinnerVerbs", "Reticulating, Percolating").ok);
  });
});

describe("validateConfigEntry — ACCEPTANCE 1: unknown keys are rejected with the list", () => {
  it("names every valid key in the rejection", () => {
    const v = validateConfigEntry("permissions.fallbck", "plan");
    strictEqual(v.ok, false);
    for (const key of knownConfigKeys()) ok(v.reason.includes(key), `${key} missing from: ${v.reason}`);
  });

  it("rejects a value outside the key's allowed set, naming the set", () => {
    const v = validateConfigEntry("permissions.fallback", "yolo");
    strictEqual(v.ok, false);
    ok(v.reason.includes("bypassPermissions"), v.reason);
    ok(v.reason.includes("yolo"), v.reason);
  });

  it("accepts every allowed value of a constrained key", () => {
    for (const mode of PERMISSION_MODES) {
      strictEqual(validateConfigEntry("permissions.fallback", mode).ok, true, mode);
    }
  });

  it("accepts any non-empty value for an unconstrained key", () => {
    strictEqual(validateConfigEntry("review.lenses", "correctness,security").ok, true);
  });

  it("rejects an empty value rather than storing a blank setting", () => {
    strictEqual(validateConfigEntry("review.lenses", "").ok, false);
    strictEqual(validateConfigEntry("review.lenses", "   ").ok, false);
  });

  it("checks the notation of tools.extra, naming the entries it refuses", () => {
    strictEqual(validateConfigEntry("tools.extra", "transcribe_audio:read, search_issues").ok, true);
    strictEqual(validateConfigEntry("tools.extra", "search-issues:write").ok, true);
    const v = validateConfigEntry("tools.extra", "a:read, b:exec, file_write:read, a");
    strictEqual(v.ok, false);
    strictEqual(v.reason, "'a:read, b:exec, file_write:read, a' is not valid for 'tools.extra': each entry is " +
      "<name>[:read|:write], a tool that is not built in, named once; not: b:exec, file_write:read, a");
    strictEqual(validateConfigEntry("tools.extra", ", ,").reason, "', ,' is not valid for 'tools.extra': it names no tool");
  });

  it("is not fooled by a nullish key", () => {
    strictEqual(validateConfigEntry(undefined, "x").ok, false);
    strictEqual(isKnownConfigKey(null), false);
  });
});

describe("layerConfig — ACCEPTANCE 2 & 3: session over file", () => {
  it("returns the file value when the session has none", () => {
    const r = resolveConfigEntry("permissions.fallback", { "permissions.fallback": "plan" }, {});
    strictEqual(r.value, "plan");
    strictEqual(r.source, "file");
  });

  it("lets a session override win", () => {
    const r = resolveConfigEntry(
      "permissions.fallback",
      { "permissions.fallback": "plan" },
      { "permissions.fallback": "bypassPermissions" },
    );
    strictEqual(r.value, "bypassPermissions");
    strictEqual(r.source, "session");
  });

  it("ACCEPTANCE 3 — dropping the session layer restores the file value", () => {
    // What /reset-session does: the bag goes, the file stays.
    const file = { "permissions.fallback": "plan" };
    const before = resolveConfigEntry("permissions.fallback", file, { "permissions.fallback": "dontAsk" });
    const after = resolveConfigEntry("permissions.fallback", file, {});
    strictEqual(before.value, "dontAsk");
    strictEqual(after.value, "plan");
    strictEqual(after.source, "file");
  });

  it("reports unset when neither layer has it", () => {
    const r = resolveConfigEntry("permissions.fallback", {}, {});
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
  });

  it("treats a blank stored value as unset in both layers", () => {
    // A blank cannot mean "override with nothing": it would shadow the file with
    // an absence, which no /config path can produce and no consumer can read.
    strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": "a" }, { "review.lenses": "  " }).value, "a");
    strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": "  " }, {}).source, "unset");
  });

  it("ignores non-string stored values instead of coercing them", () => {
    for (const junk of [42, true, {}, [], null]) {
      strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": junk } as any, {}).source, "unset", String(junk));
    }
  });

  it("returns one entry per declared key, and only declared keys", () => {
    const entries = layerConfig({ "not.a.key": "x" }, { "also.not": "y" });
    deepStrictEqual(entries.map((e) => e.key), knownConfigKeys());
  });

  it("tolerates null/undefined maps", () => {
    strictEqual(layerConfig(null, undefined).length, CONFIG_KEYS.length);
  });
});

describe("unknownStoredKeys", () => {
  it("reports pre-schema residue rather than hiding it", () => {
    // The map was free-form before B-6, so real sessions hold keys nothing reads.
    // They are reported and NOT deleted: silently dropping someone's data on the
    // next write is how a schema migration loses it.
    deepStrictEqual(unknownStoredKeys({ "old.key": "v", "permissions.fallback": "plan", "z.key": "w" }),
      ["old.key", "z.key"]);
  });

  it("is empty for a clean map", () => {
    deepStrictEqual(unknownStoredKeys({ "permissions.fallback": "plan" }), []);
    deepStrictEqual(unknownStoredKeys(null), []);
  });
});
