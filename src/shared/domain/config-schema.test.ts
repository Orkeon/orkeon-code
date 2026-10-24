// B-6 — the /config key space and its two layers. Run:
//   node --test src/shared/domain/config-schema.test.ts
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
      "answer.language": "/assistant, /summary, /transcribe --then, /voice send and /voice --go (the main loop's prompt)",
      "compaction.trigger": "/assistant (the automatic compaction at the head and the tail of a turn), /usage",
      "dev.workDir": "/dev-status (the work folder it reads)",
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
    const r = resolveConfigEntry("permissions.fallback", { "permissions.fallback": "plan" }, {}, {});
    strictEqual(r.value, "plan");
    strictEqual(r.source, "file");
  });

  it("lets a session override win", () => {
    const r = resolveConfigEntry(
      "permissions.fallback",
      { "permissions.fallback": "plan" },
      { "permissions.fallback": "bypassPermissions" },
      {},
    );
    strictEqual(r.value, "bypassPermissions");
    strictEqual(r.source, "session");
  });

  it("ACCEPTANCE 3 — dropping the session layer restores the file value", () => {
    // What /clear does: the bag goes, the file stays.
    const file = { "permissions.fallback": "plan" };
    const before = resolveConfigEntry("permissions.fallback", file, { "permissions.fallback": "dontAsk" }, {});
    const after = resolveConfigEntry("permissions.fallback", file, {}, {});
    strictEqual(before.value, "dontAsk");
    strictEqual(after.value, "plan");
    strictEqual(after.source, "file");
  });

  it("reports unset when neither layer has it", () => {
    const r = resolveConfigEntry("permissions.fallback", {}, {}, {});
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
  });

  it("treats a blank stored value as unset in both layers", () => {
    // A blank cannot mean "override with nothing": it would shadow the file with
    // an absence, which no /config path can produce and no consumer can read.
    strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": "a" }, { "review.lenses": "  " }, {}).value, "a");
    strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": "  " }, {}, {}).source, "unset");
  });

  it("ignores non-string stored values instead of coercing them", () => {
    for (const junk of [42, true, {}, [], null]) {
      strictEqual(resolveConfigEntry("review.lenses", { "review.lenses": junk } as any, {}, {}).source, "unset", String(junk));
    }
  });

  it("returns one entry per declared key, and only declared keys", () => {
    const entries = layerConfig({ "not.a.key": "x" }, { "also.not": "y" }, { "nor.this": "z" });
    deepStrictEqual(entries.map((e) => e.key), knownConfigKeys());
  });

  it("tolerates null/undefined maps", () => {
    strictEqual(layerConfig(null, undefined, null).length, CONFIG_KEYS.length);
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

describe("the user layer: a project file widens nothing (QL-06)", () => {
  const fallback = (file: Record<string, unknown>, user: Record<string, unknown>, session = {}) =>
    resolveConfigEntry("permissions.fallback", file, session, user);
  const extra = (file: Record<string, unknown>, user: Record<string, unknown>, session = {}) =>
    resolveConfigEntry("tools.extra", file, session, user);

  it("reads a key the project leaves unset from the user layer", () => {
    deepStrictEqual(fallback({}, { "permissions.fallback": "bypassPermissions" }),
      { key: "permissions.fallback", value: "bypassPermissions", source: "user" });
  });

  it("lets the project set default, plan or acceptEdits over the user's mode", () => {
    for (const mode of ["default", "plan", "acceptEdits"]) {
      deepStrictEqual(fallback({ "permissions.fallback": mode }, { "permissions.fallback": "bypassPermissions" }),
        { key: "permissions.fallback", value: mode, source: "file" }, mode);
    }
  });

  it("ignores a wider mode from the project, keeps the user's, and names the value set aside", () => {
    for (const mode of ["bypassPermissions", "dontAsk", "nonsense"]) {
      const r = fallback({ "permissions.fallback": ` ${mode} ` }, { "permissions.fallback": "plan" });
      strictEqual(r.value, "plan", mode);
      strictEqual(r.source, "user", mode);
      strictEqual(r.ignored?.value, mode, mode);
      ok(r.ignored?.reason.includes("default, plan or acceptEdits"), r.ignored?.reason);
    }
  });

  it("never lets the project set a mode wider than the one the user settings set", () => {
    const r = fallback({ "permissions.fallback": "acceptEdits" }, { "permissions.fallback": "plan" });
    strictEqual(r.value, "plan");
    strictEqual(r.source, "user");
    strictEqual(r.ignored?.value, "acceptEdits");
    ok(r.ignored?.reason.includes("wider than the user settings' 'plan'"), r.ignored?.reason);
    strictEqual(fallback({ "permissions.fallback": "default" }, { "permissions.fallback": "dontAsk" }).value, "dontAsk");
    strictEqual(fallback({ "permissions.fallback": "plan" }, { "permissions.fallback": "default" }).value, "plan");
    strictEqual(fallback({ "permissions.fallback": "acceptEdits" }, {}).value, "acceptEdits");
    strictEqual(fallback({ "permissions.fallback": "acceptEdits" }, { "permissions.fallback": "typo" }).value, "typo");
  });

  it("leaves the fallback unset when the project's wide value is ignored and the user sets none", () => {
    const r = fallback({ "permissions.fallback": "bypassPermissions" }, {});
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
    strictEqual(r.ignored?.value, "bypassPermissions");
  });

  it("lets the session set any mode: the user types it in the REPL, as /mode", () => {
    const r = fallback({ "permissions.fallback": "bypassPermissions" }, {}, { "permissions.fallback": "dontAsk" });
    deepStrictEqual(r, { key: "permissions.fallback", value: "dontAsk", source: "session" });
  });

  it("offers a project's extra tool only when the user lists it, and names the others", () => {
    const r = extra({ "tools.extra": "search_issues, deploy_prod" }, { "tools.extra": "Search_Issues:write" });
    strictEqual(r.value, "search_issues:write");
    strictEqual(r.source, "file");
    strictEqual(r.ignored?.value, "deploy_prod:write");
  });

  it("keeps a tool read only when both lists say read: a read tool is offered in plan and dontAsk too", () => {
    strictEqual(extra({ "tools.extra": "a" }, { "tools.extra": "a:read" }).value, "a:write");
    strictEqual(extra({ "tools.extra": "a:read" }, { "tools.extra": "a:write" }).value, "a:write");
    strictEqual(extra({ "tools.extra": "a:read" }, { "tools.extra": "a:read" }).value, "a:read");
  });

  it("accepts every project tool when the user lists *, as write: * grants the tools, not their class", () => {
    const r = extra({ "tools.extra": "a:read, b" }, { "tools.extra": "*" });
    deepStrictEqual(r, { key: "tools.extra", value: "a:write, b:write", source: "file" });
  });

  it("does not take *:read as *", () => {
    const r = extra({ "tools.extra": "a:read" }, { "tools.extra": "*:read" });
    strictEqual(r.value, undefined);
    strictEqual(r.ignored?.value, "a:read");
  });

  it("offers no tool when the project lists only tools the user does not: the user's list does not take over", () => {
    const r = extra({ "tools.extra": "deploy_prod" }, { "tools.extra": "search_issues" });
    strictEqual(r.value, undefined);
    strictEqual(r.source, "unset");
    strictEqual(r.ignored?.value, "deploy_prod:write");
  });

  it("offers no project tool at all when the user layer is empty", () => {
    const r = extra({ "tools.extra": "search_issues" }, {});
    strictEqual(r.value, undefined);
    strictEqual(r.ignored?.value, "search_issues:write");
  });

  it("takes the user's list, less *, when the project sets none", () => {
    deepStrictEqual(extra({}, { "tools.extra": "*, search_issues:read" }),
      { key: "tools.extra", value: "search_issues:read", source: "user" });
    strictEqual(extra({}, { "tools.extra": "*" }).source, "unset");
  });

  it("keeps a project entry that does not parse, as written, for the reader to warn about", () => {
    const r = extra({ "tools.extra": "a:read, bad:exec" }, { "tools.extra": "*" });
    strictEqual(r.value, "a:write, bad:exec");
    strictEqual(r.ignored, undefined);
  });

  it("lets the session list any tool", () => {
    deepStrictEqual(extra({ "tools.extra": "x" }, {}, { "tools.extra": "deploy_prod" }),
      { key: "tools.extra", value: "deploy_prod", source: "session" });
  });

  it("lets the project override the user on every other key", () => {
    deepStrictEqual(resolveConfigEntry("review.lenses", { "review.lenses": "style" }, {}, { "review.lenses": "security" }),
      { key: "review.lenses", value: "style", source: "file" });
    strictEqual(layerConfig({}, {}, { "advisor.model": "m" }).find((e) => e.key === "advisor.model")?.source, "user");
  });
});
