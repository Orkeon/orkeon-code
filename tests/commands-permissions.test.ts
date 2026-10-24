// /permissions (commands/_lib/permissions.ts) over the session service on
// FakeSessionStore, a config store on FakeFiles, the host gate's rules on
// FakePermissionRules and the host's tools on FakeToolCatalogue: every
// sub-command, what it hands the gate, its refusals, its usage lines, and the
// extra tools of `tools.extra`. Run:
//   node --test tests/commands-permissions.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { PERMISSIONS_USAGE, runPermissions } from "../src/commands/_lib/permissions.ts";
import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH, createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { MEMORY_TOOLS, RULEABLE_TOOLS, readRule, scriptToolAccess, toolsetFor } from "../src/shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../src/shared/domain/agent-policy/permission.ts";
import { RULE_SETS } from "../src/shared/domain/agent-policy/rule-sets.ts";
import { resolveFallbackMode } from "../src/shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY, PERMISSION_RULES_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";
import { DEFAULT_MEMORY_DIR, memoryWriteRules } from "../src/shared/domain/shared-memory/layout.ts";
import { gateLine as memoryGateLine } from "../src/shared/domain/agent-policy/permission.ts";

/** The built-in denies every sync adds after the session's rules: no model tool writes the memory's candidates or entries. */
const MEMORY_LINES = memoryWriteRules(DEFAULT_MEMORY_DIR).map(memoryGateLine);
const MEMORY_GATE = MEMORY_LINES.map((line) => `add ${line}`);

const NO_GATE_RULES =
  "⚠ the host keeps no session rules (orkeon-repl does): the gate decides each call from the mode alone.";

/** The third line of the enforcement block: the dev crews' tool callback. */
const CALLBACK = [
  "                       3) dev crews' callback (/dev-spec, /dev-change, /dev-plan, /dev-implement,",
  "                          /dev-batches, /dev-verify, a /tasks repair), after the gate allowed a call:",
  "                          the step's rule sets and a role's roots again, glob/grep/count_pattern by",
  "                          their whole input, the act's mode when the host has no gate, then the",
    "                          pre-tool and post-tool hooks (/hooks); it can refuse, never allow more",
];

/** The closing lines of the enforcement block when the host says its gate is on. */
const GATE_ON = [
  "                       the gate is on (Orkeon:Security:PermissionGate:Enabled, the host says): the rules",
  "                       and the modes above hold at each call",
];

/** The same lines when the host says its gate is off: the surface above is not enforced. */
const GATE_OFF = [
  "⚠ the gate is OFF (Orkeon:Security:PermissionGate:Enabled is not true, the host says): no rule above",
  "                       is enforced and nothing asks",
];

/** The closing lines when the host cannot say (a runtime before Orkeon #128, or no session rules). */
const GATE_SETTING = [
  "                       the gate runs only when Orkeon:Security:PermissionGate:Enabled is true, which",
  "                       the launcher sets: off, no rule above is enforced and nothing asks",
];

/** What /permissions says about a dormant rule. */
const dormant = (rule: string) =>
  `⚠ rule ${rule} is dormant: its tool is neither built in nor listed in tools.extra. It is kept, not handed to ` +
  "the gate, and applies again once the tool is listed (/permissions remove deletes it).";

/** A rule read from its line, as /permissions add reads it. */
const R = (line: string): PermissionRule => readRule(line)!;

/** The line /permissions show adds while a dev step's rule sets are in the gate. */
const SETS_HELD =
  "⚠ the gate also holds the rule sets of the last dev step: the next /assistant turn or rule change hands it the " +
  "session's rules alone.";
const OTHER_RULES = "⚠ the gate holds other rules than the session: the next change or /assistant hands it these.";

function setup() {
  const files = new FakeFiles();
  const store = new FakeSessionStore();
  const gate = new FakePermissionRules();
  const config = createConfigStore({ files, session: store });
  const session = createSessionIo({ store, config });
  const catalogue = new FakeToolCatalogue();
  const run = (...tokens: string[]) => runPermissions(tokens, { session, gate, config, catalogue });
  const rules = (): unknown => JSON.parse(store.state.get(PERMISSION_RULES_STATE_KEY) ?? "null");
  const seedRules = (...stored: string[]) => store.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  /** Configures `tools.extra` in the user settings and registers `registered` with the host. */
  const extraTools = async (setting: string, ...registered: string[]) => {
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": setting }));
    for (const name of registered) catalogue.tools.set(name, "");
  };
  return { files, store, gate, catalogue, run, rules, seedRules, extraTools };
}

describe("/permissions show", () => {
  it("shows the fallback mode, the catalogue, no rules and an empty gate (the default sub-command)", async () => {
    const { gate, run } = setup();
    const lines = (await run()).text!.split("\n");
    strictEqual(lines[0], "session default mode : default ");
    strictEqual(lines[1], `  ↳ source           : ${resolveFallbackMode(undefined).explanation}`);
    // The shared memory's tools follow the catalogue: both in default.
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default"), ...MEMORY_TOOLS].join(", ")}`);
    // spawn_agent is in no catalogue, yet no mode withholds it: the script host appends it to every act.
    strictEqual(lines[4], "  ↳ withheld by mode : (none)");
    strictEqual(lines[5], "  ↳ removed by rule  : (none)");
    strictEqual(lines[6], "session rules        : (none)");
    strictEqual(lines[7], "in the host gate     : (none)");
    ok(lines[11].endsWith("acceptEdits ask you: [y] once / [s] session / [n] no"), lines[11]);
    deepStrictEqual(lines.slice(12, 17), CALLBACK, "the dev crews' callback, the third line");
    deepStrictEqual(lines.slice(17), GATE_ON, "the host says its gate is on");
    deepStrictEqual(await run("show"), await run());
    deepStrictEqual(gate.calls, [], "show hands the gate nothing");
  });

  it("lists the shared memory's tools the mode offers, and one a deny rule removes whole", async () => {
    const { run, seedRules } = setup();
    seedRules("deny:memory_push");
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default"), "memory_recall"].join(", ")}`);
    strictEqual(lines[5], "  ↳ removed by rule  : memory_push");
  });

  it("shows the /mode default, what it withholds, what the rules change, and why a rule is inert", async () => {
    const { store, gate, run, seedRules } = setup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    seedRules("deny:file_read", "allow shell_command command=npm test*", "bogus");
    gate.rules = [
      { effect: "deny", tool: "file_read" },
      { effect: "allow", tool: "shell_command", argument: "command", pattern: "npm test*" },
    ];
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[0], "session default mode : plan (read-only)");
    strictEqual(lines[1], "  ↳ source           : set by /mode (session state)");
    // Orkeon Code's own tools belong to the dev crews that attach them: never listed for the session, except the
    // shared memory's, which plan offers memory_recall of and withholds memory_push.
    const withheld = RULEABLE_TOOLS.filter((t) => !toolsetFor("plan").includes(t) && (scriptToolAccess(t) === undefined || t === "memory_push"));
    strictEqual(lines[4], `  ↳ withheld by mode : ${withheld.join(", ")}`);
    strictEqual(lines[5], "  ↳ removed by rule  : file_read");
    strictEqual(lines[6], "session rules        : deny file_read, allow shell_command command=npm test*");
    strictEqual(lines[7], "in the host gate     : deny file_read, allow shell_command command=npm test*");
    ok(lines[19].startsWith(
      "⚠ rule allow shell_command command=npm test* has NO effect in 'plan': mode 'plan' ignores every allow rule",
    ), lines[19]);
    strictEqual(lines[20], "⚠ 1 stored entry is not a rule (bogus): kept as written, ignored; /permissions clear removes them.");
    strictEqual(lines.length, 21);
  });

  it("says when the gate holds other rules than the session, or none at all", async () => {
    const { gate, run, seedRules } = setup();
    seedRules("deny file_write");
    let lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "in the host gate     : (none)");
    strictEqual(lines[19], "⚠ the gate holds other rules than the session: the next change or /assistant hands it these.");
    gate.kept = false;
    lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "in the host gate     : (the host keeps no session rules)");
    strictEqual(lines.length, 19);
  });

  it("groups the rule sets a dev step left in the gate, and says the next turn hands it the session's alone", async () => {
    const { gate, run, seedRules } = setup();
    seedRules("deny file_write");
    gate.rules = [R("deny file_write"), ...RULE_SETS["read-noise"].rules];
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "in the host gate     : deny file_write; rule sets of the last dev step: read-noise (64 rules)");
    ok(lines.includes(SETS_HELD));
    ok(!lines.includes(OTHER_RULES));
  });

  it("names the shared memory's guard a sync adds, apart from the session's rules", async () => {
    const { run, seedRules } = setup();
    seedRules("deny file_write");
    await run("add", "deny", "http_api");
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "in the host gate     : deny file_write, deny http_api; the shared memory's guard: no tool of the " +
      `model writes under .orkeon/memory/candidates or .orkeon/memory/entries (${MEMORY_LINES.length} rules)`);
    ok(!lines.includes(OTHER_RULES));
  });

  it("shows only the sets when the session holds no rule", async () => {
    const { gate, run } = setup();
    gate.rules = [...RULE_SETS["git-readonly"].rules];
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "in the host gate     : rule sets of the last dev step: git-readonly (220 rules)");
  });
});

describe("/permissions list", () => {
  it("says there are none, with the usage line", async () => {
    deepStrictEqual(await setup().run("list"), { text: `no permission rules set. ${PERMISSIONS_USAGE}` });
  });

  it("tables the rules with the calls they cover and whether they are enforced, and counts the non-rules", async () => {
    const { run, seedRules } = setup();
    seedRules("deny:shell_command", "allow:nope", "bogus", "allow shell_command command=npm test*");
    deepStrictEqual(await run("list"), {
      table: [
        { effect: "deny", tool: "shell_command", calls: "every call", state: "enforced" },
        { effect: "allow", tool: "shell_command", calls: "command=npm test*", state: "enforced" },
        { effect: "allow", tool: "nope", calls: "every call", state: "dormant: not in tools.extra" },
      ],
      text: "⚠ 1 stored entry is not a rule (bogus): kept as written, ignored; /permissions clear removes them.",
    });
    seedRules("deny:shell_command");
    deepStrictEqual(await run("list"), {
      table: [{ effect: "deny", tool: "shell_command", calls: "every call", state: "enforced" }],
      text: undefined,
    });
  });
});

describe("/permissions add", () => {
  it("stores a whole-tool rule, hands the gate every rule, and shows the catalogue it leaves", async () => {
    const { gate, run, rules } = setup();
    const catalogue = toolsetFor("default").filter((t) => t !== "shell_command");
    deepStrictEqual(await run("add", "deny", "shell_command"), {
      text: `rule deny shell_command added.\ncatalogue for 'default': ${catalogue.join(", ")}`,
    });
    deepStrictEqual(rules(), ["deny shell_command"]);
    deepStrictEqual(gate.calls, ["clear", "add deny shell_command", ...MEMORY_GATE]);
  });

  it("stores a rule with an argument pattern, spaces included, and leaves the catalogue whole", async () => {
    const { gate, run, rules, seedRules } = setup();
    seedRules("deny:file_write");
    deepStrictEqual(await run("add", "allow", "shell_command", "command=npm", "test*"), {
      text: "rule allow shell_command command=npm test* added.\n" +
        `catalogue for 'default': ${toolsetFor("default").filter((t) => t !== "file_write").join(", ")}`,
    });
    // Every other stored entry is kept as written, the old `effect:tool` form included.
    deepStrictEqual(rules(), ["deny:file_write", "allow shell_command command=npm test*"]);
    deepStrictEqual(gate.calls, ["clear", "add deny file_write", "add allow shell_command command=npm test*", ...MEMORY_GATE]);
  });

  it("replaces the opposite effect on the same calls, and keeps rules on other calls of the tool", async () => {
    const { run, rules, seedRules } = setup();
    seedRules("deny:file_read", "deny shell_command command=git push*", "deny:shell_command");
    await run("add", "allow", "shell_command");
    deepStrictEqual(rules(), ["deny:file_read", "deny shell_command command=git push*", "allow shell_command"]);
    await run("add", "allow", "shell_command", "command=git", "push*");
    deepStrictEqual(rules(), ["deny:file_read", "allow shell_command", "allow shell_command command=git push*"]);
  });

  it("says when the rule has no effect in the session's mode", async () => {
    const { store, run } = setup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    const lines = (await run("add", "allow", "file_write")).text!.split("\n");
    strictEqual(lines[0], "rule allow file_write added.");
    ok(lines[1].startsWith("⚠ it has NO effect in 'plan': mode 'plan' ignores every allow rule"), lines[1]);
    strictEqual(lines[2], `catalogue for 'plan': ${toolsetFor("plan").join(", ")}`);
    strictEqual(lines.length, 3);
  });

  it("stores the rule and says so when the host keeps no session rules", async () => {
    const { gate, run, rules } = setup();
    gate.kept = false;
    const lines = (await run("add", "deny", "http_api")).text!.split("\n");
    strictEqual(lines[0], "rule deny http_api added.");
    strictEqual(lines[2], NO_GATE_RULES);
    deepStrictEqual(rules(), ["deny http_api"]);
  });

  it("refuses a text that is not a rule, an unknown tool, and an argument the tool does not take", async () => {
    const { gate, run, rules } = setup();
    const grammar = { text: `invalid rule: expected <deny|allow> <tool> [<argument>=<pattern>].\n${PERMISSIONS_USAGE}` };
    deepStrictEqual(await run("add", "permit", "file_read"), grammar);
    deepStrictEqual(await run("add", "allow", "shell_command", "npm", "test"), grammar);
    deepStrictEqual(await run("add", "allow", "shell_command", "command="), grammar);
    deepStrictEqual(await run("add", "deny", "nope"), {
      text: `invalid rule: 'nope' is no tool a rule may name: one of ${RULEABLE_TOOLS.join(", ")}.\n${PERMISSIONS_USAGE}`,
    });
    deepStrictEqual(await run("add", "allow", "shell_command", "cmd=npm", "test*"), {
      text: "invalid rule: 'shell_command' has no argument 'cmd': it takes command, working_directory, " +
        `timeout_seconds, action, job_id, tail_lines.\n${PERMISSIONS_USAGE}`,
    });
    strictEqual(rules(), null);
    deepStrictEqual(gate.calls, []);
  });

  it("takes a quoted pattern without its quotes, and the tool in its own spelling", async () => {
    const { gate, run, rules } = setup();
    const lines = (await run("add", "allow", "Shell_Command", "command=\"npm", "test*\"")).text!.split("\n");
    strictEqual(lines[0], "rule allow shell_command command=npm test* added.");
    deepStrictEqual(rules(), ["allow shell_command command=npm test*"]);
    deepStrictEqual(gate.calls, ["clear", "add allow shell_command command=npm test*", ...MEMORY_GATE]);
  });
});

describe("/permissions remove and clear", () => {
  it("removes a rule, says when there is no such rule, and hands the gate what is left", async () => {
    const { gate, run, rules, seedRules } = setup();
    seedRules("deny:file_read", "deny:shell_command", "allow shell_command command=npm test*");
    deepStrictEqual(await run("remove", "allow", "file_read"), { text: "no such rule: allow file_read." });
    deepStrictEqual(await run("remove", "allow", "shell_command"), { text: "no such rule: allow shell_command." });
    deepStrictEqual(gate.calls, []);
    deepStrictEqual(await run("remove", "allow", "shell_command", "command=npm", "test*"), {
      text: "rule allow shell_command command=npm test* removed.",
    });
    deepStrictEqual(await run("remove", "deny", "file_read"), { text: "rule deny file_read removed." });
    deepStrictEqual(rules(), ["deny:shell_command"]);
    deepStrictEqual(gate.list(), ["deny shell_command", ...MEMORY_LINES]);
  });

  it("refuses a text that is not a rule", async () => {
    deepStrictEqual(await setup().run("remove", "deny"), {
      text: `invalid rule: expected <deny|allow> <tool> [<argument>=<pattern>].\n${PERMISSIONS_USAGE}`,
    });
  });

  it("clears every rule, in the session and in the gate", async () => {
    const { gate, run, rules, seedRules } = setup();
    seedRules("deny:file_read");
    gate.rules = [{ effect: "deny", tool: "file_read" }];
    deepStrictEqual(await run("clear"), { text: "all permission rules cleared (the mode decides alone)." });
    deepStrictEqual(rules(), []);
    deepStrictEqual(gate.calls, ["clear", ...MEMORY_GATE]);
    deepStrictEqual(gate.list(), MEMORY_LINES);
  });

  it("clears the session's rules and says so when the host keeps none", async () => {
    const { gate, run } = setup();
    gate.kept = false;
    deepStrictEqual(await run("clear"), {
      text: `all permission rules cleared (the mode decides alone).\n${NO_GATE_RULES}`,
    });
  });
});

describe("/permissions — the extra tools of tools.extra", () => {
  const EXTRAS = [
    { name: "transcribe_audio", access: "read" as const },
    { name: "search_issues", access: "write" as const },
  ];

  it("shows them in the catalogue of the modes that offer them, and the ones the host lacks", async () => {
    const { store, run, extraTools } = setup();
    await extraTools("transcribe_audio:read, search_issues, gone:read, bad:exec", "transcribe_audio", "search_issues");
    let lines = (await run("show")).text!.split("\n");
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default", EXTRAS), ...MEMORY_TOOLS].join(", ")}`);
    // spawn_agent is in no catalogue, yet no mode withholds it: the script host appends it to every act.
    strictEqual(lines[4], "  ↳ withheld by mode : (none)");
    strictEqual(lines[6],
      "  ↳ extra tools      : transcribe_audio (read), search_issues (write); not registered: gone (read); ignored: bad:exec");
    strictEqual(lines.length, 20);
    store.state.set(DEFAULT_MODE_STATE_KEY, "dontAsk");
    lines = (await run("show")).text!.split("\n");
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("dontAsk", EXTRAS), "memory_recall"].join(", ")}`);
    ok(lines[3].includes("transcribe_audio") && !lines[3].includes("search_issues"), lines[3]);
    ok(lines[4].endsWith(", search_issues"), lines[4]);
  });

  it("accepts a rule on a configured extra tool, registered or not, and refuses an unknown one", async () => {
    const { gate, run, rules, extraTools } = setup();
    await extraTools("search_issues gone_tool:read", "search_issues");
    const lines = (await run("add", "deny", "search_issues", "query=secret*")).text!.split("\n");
    strictEqual(lines[0], "rule deny search_issues query=secret* added.");
    ok(lines[1].startsWith("⚠ the arguments of 'search_issues' are not known here"), lines[1]);
    strictEqual(lines[2], `catalogue for 'default': ${toolsetFor("default", [EXTRAS[1]]).join(", ")}`);
    strictEqual((await run("add", "allow", "gone_tool")).text!.split("\n")[0], "rule allow gone_tool added.");
    deepStrictEqual(rules(), ["deny search_issues query=secret*", "allow gone_tool"]);
    deepStrictEqual(gate.list(), ["deny search_issues query=secret*", "allow gone_tool", ...MEMORY_LINES]);
    deepStrictEqual(await run("add", "deny", "never_configured"), {
      text: "invalid rule: 'never_configured' is no tool a rule may name: one of " +
        `${[...RULEABLE_TOOLS, "search_issues", "gone_tool"].join(", ")}.\n${PERMISSIONS_USAGE}`,
    });
    deepStrictEqual(await run("remove", "allow", "gone_tool"), { text: "rule allow gone_tool removed." });
    deepStrictEqual((await run("list")).table, [
      { effect: "deny", tool: "search_issues", calls: "query=secret*", state: "enforced" },
    ]);
  });

  it("keeps a rule on a tool tools.extra no longer lists, dormant, through every change, until it is listed again", async () => {
    const { gate, run, rules, extraTools } = setup();
    await extraTools("create_issue", "create_issue");
    await run("add", "deny", "create_issue");
    deepStrictEqual(gate.list(), ["deny create_issue", ...MEMORY_LINES]);

    // create_issue leaves tools.extra: the rule stays stored, out of the gate, and says so.
    await extraTools("transcribe_audio:read", "transcribe_audio");
    let lines = (await run("add", "deny", "http_api")).text!.split("\n");
    deepStrictEqual(lines.slice(-1), [dormant("deny create_issue")]);
    await run("remove", "deny", "http_api");
    await run("add", "allow", "file_write");
    deepStrictEqual(rules(), ["deny create_issue", "allow file_write"]);
    deepStrictEqual(gate.list(), ["allow file_write", ...MEMORY_LINES]);
    lines = (await run("show")).text!.split("\n");
    strictEqual(lines[7], "session rules        : allow file_write; dormant: deny create_issue");
    ok(lines.includes(dormant("deny create_issue")), lines.join("\n"));
    deepStrictEqual((await run("list")).table, [
      { effect: "allow", tool: "file_write", calls: "every call", state: "enforced" },
      { effect: "deny", tool: "create_issue", calls: "every call", state: "dormant: not in tools.extra" },
    ]);

    // Listed again: the rule is enforced again, without being re-added.
    await extraTools("create_issue", "create_issue");
    await run("remove", "allow", "file_write");
    deepStrictEqual(rules(), ["deny create_issue"]);
    deepStrictEqual(gate.list(), ["deny create_issue", ...MEMORY_LINES]);
  });

  it("removes a dormant rule by name, and clears it with the rest", async () => {
    const { gate, run, rules, seedRules } = setup();
    seedRules("deny create_issue", "deny file_write", "bogus");
    deepStrictEqual(await run("remove", "deny", "create_issue"), {
      text: "rule deny create_issue removed.\n⚠ 1 stored entry is not a rule (bogus): kept as written, ignored; " +
        "/permissions clear removes them.",
    });
    deepStrictEqual(rules(), ["deny file_write", "bogus"]);
    await run("clear");
    deepStrictEqual(rules(), []);
    deepStrictEqual(gate.list(), MEMORY_LINES);
  });

  it("rewrites no rule away when tools.extra cannot be read, and says why the extra tools are unknown", async () => {
    const { store, gate, seedRules } = setup();
    seedRules("deny create_issue", "deny file_write");
    const files = new FakeFiles();
    files.readErrors.set("/workspace/.orkeon/config.json", new Error("permission denied"));
    const config = createConfigStore({ files, session: store });
    const session = createSessionIo({ store, config });
    const run = (...tokens: string[]) => runPermissions(tokens, { session, gate, config, catalogue: new FakeToolCatalogue() });
    const lines = (await run("add", "deny", "http_api")).text!.split("\n");
    ok(lines.includes(
      "⚠ tools.extra could not be read (/workspace/.orkeon/config.json could not be read or parsed): no extra tool " +
        "is known, and the rules on " +
        "extra tools are dormant.",
    ), lines.join("\n"));
    ok(lines.includes(dormant("deny create_issue")), lines.join("\n"));
    deepStrictEqual(JSON.parse(store.state.get(PERMISSION_RULES_STATE_KEY)!), [
      "deny create_issue", "deny file_write", "deny http_api",
    ]);
    deepStrictEqual(gate.list(), ["deny file_write", "deny http_api", ...MEMORY_LINES]);
  });
});

describe("/permissions — a project file widens nothing (QL-06)", () => {
  it("keeps the user's mode over a project's bypassPermissions, and names the value it ignored", async () => {
    const { files, run } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "acceptEdits" }));
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[0], "session default mode : acceptEdits ");
    strictEqual(lines[1], `  ↳ source           : ${resolveFallbackMode("acceptEdits").explanation}`);
    strictEqual(lines[2],
      "  ↳ ignored          : the project file sets permissions.fallback 'bypassPermissions': a project file may set " +
      "only default, plan or acceptEdits; another mode comes from the user settings (orkeonCode) or /mode");
  });

  it("names a mode written nested in the project file, which nothing reads", async () => {
    const { files, run } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ permissions: { fallback: "bypassPermissions" } }));
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[0], "session default mode : default ");
    ok(lines.includes(
      '⚠ permissions.fallback is written nested in a settings file ({"permissions": {…}}), so nothing reads it: ' +
        'write it flat, "permissions.fallback": ….'), lines.join("\n"));
  });

  it("runs the built-in default when the user settings set no mode", async () => {
    const { files, run } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));
    const lines = (await run("show")).text!.split("\n");
    strictEqual(lines[0], "session default mode : default ");
    ok(lines[2].startsWith("  ↳ ignored          : the project file sets permissions.fallback 'bypassPermissions'"), lines[2]);
  });

  it("does not offer a project's extra tool the user settings do not list, and names it", async () => {
    const { files, catalogue, run } = setup();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues, deploy_prod" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues" }));
    catalogue.tools.set("search_issues", "");
    catalogue.tools.set("deploy_prod", "");
    const lines = (await run("show")).text!.split("\n");
    ok(lines[3].includes("search_issues") && !lines[3].includes("deploy_prod"), lines[3]);
    ok(lines.includes(
      "⚠ tools.extra of the project file names deploy_prod:write, which the user settings do not allow " +
        "(orkeonCode tools.extra, or *): not offered.",
    ), lines.join("\n"));
  });

  it("says when the user settings cannot be read", async () => {
    const { files, run } = setup();
    files.files.set(USER_CONFIG_FILE_PATH, "{ oops");
    const lines = (await run("show")).text!.split("\n");
    ok(lines.includes(
      `⚠ the user settings (${USER_CONFIG_FILE_PATH}) could not be read or parsed: no user setting applies.`,
    ), lines.join("\n"));
  });
});

describe("/permissions — anything else", () => {
  it("answers the usage line", async () => {
    deepStrictEqual(await setup().run("grant"), { text: PERMISSIONS_USAGE });
  });

  it("states the rule grammar in the usage line", () => {
    strictEqual(
      PERMISSIONS_USAGE,
      "usage: /permissions [show] | add <deny|allow> <tool> [<argument>=<pattern>] | " +
        "remove <deny|allow> <tool> [<argument>=<pattern>] | list | clear",
    );
  });
});

describe("/permissions show: the host gate's state", () => {
  it("warns when the host says its gate is off: nothing above is enforced", async () => {
    const { gate, run } = setup();
    gate.hostGate = false;
    const lines = (await run()).text!.split("\n");
    deepStrictEqual(lines.slice(17), GATE_OFF);
  });

  it("falls back to the setting's description when the host cannot say", async () => {
    const { gate, run } = setup();
    gate.hostGate = undefined;
    const lines = (await run()).text!.split("\n");
    deepStrictEqual(lines.slice(17), GATE_SETTING);
  });
});
