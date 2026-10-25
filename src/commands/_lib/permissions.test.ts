// /permissions (commands/_lib/permissions.ts) over the session service on
// FakeSessionStore, a config store on FakeFiles, the host gate's rules on
// FakePermissionRules and the host's tools on FakeToolCatalogue: every
// sub-command, what it hands the gate, its refusals, its usage lines, and the
// extra tools of `tools.extra`. Run:
//   node --test src/commands/_lib/permissions.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { PERMISSIONS_USAGE } from "./permissions.ts";
import { CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH } from "../../shared/application/config-store.ts";
import { MEMORY_TOOLS, RULEABLE_TOOLS, scriptToolAccess, toolsetFor } from "../../shared/domain/agent-policy/permission.ts";
import { RULE_SETS } from "../../shared/domain/agent-policy/rule-sets.ts";
import { resolveFallbackMode } from "../../shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY, PERMISSION_RULES_STATE_KEY } from "../../shared/domain/session-keys.ts";
import {
  CALLBACK,
  GATE_OFF,
  GATE_ON,
  GATE_SETTING,
  GRAMMAR,
  MEMORY_GATE,
  MEMORY_LINES,
  NOT_A_RULE_TEXT,
  NO_GATE_RULES,
  NO_SUCH_RULE_CASES,
  OTHER_RULES,
  R,
  REFUSED_ADD_CASES,
  REMOVE_SEED,
  SETS_HELD,
  USAGE_TEXT,
  dormant,
  dormantRuleSession,
  extraRulesSession,
  leftToolsExtraSession,
  permissionsHarness,
  unreadableConfigRun,
} from "./permissions.fixtures.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

describe("/permissions show", () => {
  it("shows the fallback mode, the catalogue, no rules and an empty gate (the default sub-command)", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();

    // Act
    const lines = (await run()).text!.split("\n");

    // Assert
    strictEqual(lines[0], "session default mode : default ");
    strictEqual(lines[1], `  ↳ source           : ${resolveFallbackMode(undefined).explanation}`);
    // The shared memory's tools follow the catalogue: both in default.
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default"), ...MEMORY_TOOLS].join(", ")}`);
    // spawn_agent is in no catalogue, yet no mode withholds it: the script host appends it to every act.
    strictEqual(lines[4], "  ↳ withheld by mode : (none)");
    strictEqual(lines[5], "  ↳ removed by rule  : (none)");
    strictEqual(lines[6], "session rules        : (none)");
    strictEqual(lines[7], "in the host gate     : (none)");
    ok(lines[11].endsWith("acceptEdits ask you: [y] once / [s] session / [n] no; a background"), lines[11]);
    ok(lines[12].endsWith("command's question names its task (for [t1]), answered from the main prompt"), lines[12]);
    deepStrictEqual(lines.slice(13, 18), CALLBACK, "the dev crews' callback, the third line");
    deepStrictEqual(lines.slice(18), GATE_ON, "the host says its gate is on");
    deepStrictEqual(gate.calls, [], "show hands the gate nothing");
  });

  it("answers `show` as the default sub-command, and hands the gate nothing", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();
    const bare = await permissionsHarness().run();

    // Act
    const view = await run("show");

    // Assert
    deepStrictEqual(view, bare);
    deepStrictEqual(gate.calls, [], "show hands the gate nothing");
  });

  it("lists the shared memory's tools the mode offers, and one a deny rule removes whole", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules("deny:memory_push");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default"), "memory_recall"].join(", ")}`);
    strictEqual(lines[5], "  ↳ removed by rule  : memory_push");
  });

  it("shows the /mode default, what it withholds, what the rules change, and why a rule is inert", async () => {
    // Arrange
    const { store, gate, run, seedRules } = permissionsHarness();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    seedRules("deny:file_read", "allow shell_command command=npm test*", "bogus");
    gate.rules = [
      { effect: "deny", tool: "file_read" },
      { effect: "allow", tool: "shell_command", argument: "command", pattern: "npm test*" },
    ];

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "session default mode : plan (read-only)");
    strictEqual(lines[1], "  ↳ source           : set by /mode (session state)");
    // Orkeon Code's own tools belong to the dev crews that attach them: never listed for the session, except the
    // shared memory's, which plan offers memory_recall of and withholds memory_push.
    const withheld = RULEABLE_TOOLS.filter((t) => !toolsetFor("plan").includes(t) && (scriptToolAccess(t) === undefined || t === "memory_push"));
    strictEqual(lines[4], `  ↳ withheld by mode : ${withheld.join(", ")}`);
    strictEqual(lines[5], "  ↳ removed by rule  : file_read");
    strictEqual(lines[6], "session rules        : deny file_read, allow shell_command command=npm test*");
    strictEqual(lines[7], "in the host gate     : deny file_read, allow shell_command command=npm test*");
    ok(lines[20].startsWith(
      "⚠ rule allow shell_command command=npm test* has NO effect in 'plan': mode 'plan' ignores every allow rule",
    ), lines[20]);
    strictEqual(lines[21], NOT_A_RULE_TEXT);
    strictEqual(lines.length, 22);
  });

  it("says when the gate holds other rules than the session", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules("deny file_write");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "in the host gate     : (none)");
    strictEqual(lines[20], OTHER_RULES);
  });

  it("says when the host keeps no session rules at all", async () => {
    // Arrange
    const { gate, run, seedRules } = permissionsHarness();
    seedRules("deny file_write");
    gate.kept = false;

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "in the host gate     : (the host keeps no session rules)");
    strictEqual(lines.length, 20);
  });

  it("groups the rule sets a dev step left in the gate, and says the next turn hands it the session's alone", async () => {
    // Arrange
    const { gate, run, seedRules } = permissionsHarness();
    seedRules("deny file_write");
    gate.rules = [R("deny file_write"), ...RULE_SETS["read-noise"].rules];

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "in the host gate     : deny file_write; rule sets of the last dev step: read-noise (64 rules)");
    ok(lines.includes(SETS_HELD));
    ok(!lines.includes(OTHER_RULES));
  });

  it("names the shared memory's guard a sync adds, apart from the session's rules", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules("deny file_write");
    await run("add", "deny", "http_api");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "in the host gate     : deny file_write, deny http_api; the shared memory's guard: no tool of the " +
      `model writes under .orkeon/memory/candidates or .orkeon/memory/entries (${MEMORY_LINES.length} rules)`);
    ok(!lines.includes(OTHER_RULES));
  });

  it("shows only the sets when the session holds no rule", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();
    gate.rules = [...RULE_SETS["git-readonly"].rules];

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "in the host gate     : rule sets of the last dev step: git-readonly (218 rules)");
  });
});

describe("/permissions list", () => {
  it("says there are none, with the usage line", async () => {
    // Arrange
    const { run } = permissionsHarness();

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, { text: `no permission rules set. ${PERMISSIONS_USAGE}` });
  });

  it("tables the rules with the calls they cover and whether they are enforced, and counts the non-rules", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules("deny:shell_command", "allow:nope", "bogus", "allow shell_command command=npm test*");

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, {
      table: [
        { effect: "deny", tool: "shell_command", calls: "every call", state: "enforced" },
        { effect: "allow", tool: "shell_command", calls: "command=npm test*", state: "enforced" },
        { effect: "allow", tool: "nope", calls: "every call", state: "dormant: not in tools.extra" },
      ],
      text: NOT_A_RULE_TEXT,
    });
  });

  it("tables the rules with no text when every entry is a rule", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules("deny:shell_command");

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view, {
      table: [{ effect: "deny", tool: "shell_command", calls: "every call", state: "enforced" }],
      text: undefined,
    });
  });
});

describe("/permissions add", () => {
  it("stores a whole-tool rule, hands the gate every rule, and shows the catalogue it leaves", async () => {
    // Arrange
    const { gate, run, rules } = permissionsHarness();
    const catalogue = toolsetFor("default").filter((t) => t !== "shell_command");

    // Act
    const view = await run("add", "deny", "shell_command");

    // Assert
    deepStrictEqual(view, {
      text: `rule deny shell_command added.\ncatalogue for 'default': ${catalogue.join(", ")}`,
    });
    deepStrictEqual(rules(), ["deny shell_command"]);
    deepStrictEqual(gate.calls, ["clear", "add deny shell_command", ...MEMORY_GATE]);
  });

  it("stores a rule with an argument pattern, spaces included, and leaves the catalogue whole", async () => {
    // Arrange
    const { gate, run, rules, seedRules } = permissionsHarness();
    seedRules("deny:file_write");

    // Act
    const view = await run("add", "allow", "shell_command", "command=npm", "test*");

    // Assert
    deepStrictEqual(view, {
      text: "rule allow shell_command command=npm test* added.\n" +
        `catalogue for 'default': ${toolsetFor("default").filter((t) => t !== "file_write").join(", ")}`,
    });
    // Every other stored entry is kept as written, the old `effect:tool` form included.
    deepStrictEqual(rules(), ["deny:file_write", "allow shell_command command=npm test*"]);
    deepStrictEqual(gate.calls, ["clear", "add deny file_write", "add allow shell_command command=npm test*", ...MEMORY_GATE]);
  });

  it("replaces the opposite effect on the same calls, and keeps rules on other calls of the tool", async () => {
    // Arrange
    const { run, rules, seedRules } = permissionsHarness();
    seedRules("deny:file_read", "deny shell_command command=git push*", "deny:shell_command");

    // Act
    await run("add", "allow", "shell_command");

    // Assert
    deepStrictEqual(rules(), ["deny:file_read", "deny shell_command command=git push*", "allow shell_command"]);
  });

  it("replaces the opposite effect on the same argument pattern, and keeps the whole-tool rule", async () => {
    // Arrange
    const { run, rules, seedRules } = permissionsHarness();
    seedRules("deny:file_read", "deny shell_command command=git push*", "deny:shell_command");
    await run("add", "allow", "shell_command");

    // Act
    await run("add", "allow", "shell_command", "command=git", "push*");

    // Assert
    deepStrictEqual(rules(), ["deny:file_read", "allow shell_command", "allow shell_command command=git push*"]);
  });

  it("says when the rule has no effect in the session's mode", async () => {
    // Arrange
    const { store, run } = permissionsHarness();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");

    // Act
    const lines = (await run("add", "allow", "file_write")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "rule allow file_write added.");
    ok(lines[1].startsWith("⚠ it has NO effect in 'plan': mode 'plan' ignores every allow rule"), lines[1]);
    strictEqual(lines[2], `catalogue for 'plan': ${toolsetFor("plan").join(", ")}`);
    strictEqual(lines.length, 3);
  });

  it("stores the rule and says so when the host keeps no session rules", async () => {
    // Arrange
    const { gate, run, rules } = permissionsHarness();
    gate.kept = false;

    // Act
    const lines = (await run("add", "deny", "http_api")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "rule deny http_api added.");
    strictEqual(lines[2], NO_GATE_RULES);
    deepStrictEqual(rules(), ["deny http_api"]);
  });

  for (const c of REFUSED_ADD_CASES) {
    it(`refuses ${c.name}, storing nothing and handing the gate nothing`, async () => {
      // Arrange
      const { gate, run, rules } = permissionsHarness();

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, c.expected);
      strictEqual(rules(), null);
      deepStrictEqual(gate.calls, []);
    });
  }

  it("takes a quoted pattern without its quotes, and the tool in its own spelling", async () => {
    // Arrange
    const { gate, run, rules } = permissionsHarness();

    // Act
    const lines = (await run("add", "allow", "Shell_Command", "command=\"npm", "test*\"")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "rule allow shell_command command=npm test* added.");
    deepStrictEqual(rules(), ["allow shell_command command=npm test*"]);
    deepStrictEqual(gate.calls, ["clear", "add allow shell_command command=npm test*", ...MEMORY_GATE]);
  });
});

describe("/permissions remove and clear", () => {
  for (const c of NO_SUCH_RULE_CASES) {
    it(`says when there is no such rule: ${c.name}, and hands the gate nothing`, async () => {
      // Arrange
      const { gate, run, seedRules } = permissionsHarness();
      seedRules(...REMOVE_SEED);

      // Act
      const view = await run(...c.tokens);

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(gate.calls, []);
    });
  }

  it("removes a rule with an argument pattern", async () => {
    // Arrange
    const { run, seedRules } = permissionsHarness();
    seedRules(...REMOVE_SEED);

    // Act
    const view = await run("remove", "allow", "shell_command", "command=npm", "test*");

    // Assert
    deepStrictEqual(view, { text: "rule allow shell_command command=npm test* removed." });
  });

  it("removes a rule in the old form, and hands the gate what is left", async () => {
    // Arrange
    const { gate, run, rules, seedRules } = permissionsHarness();
    seedRules(...REMOVE_SEED);
    await run("remove", "allow", "shell_command", "command=npm", "test*");

    // Act
    const view = await run("remove", "deny", "file_read");

    // Assert
    deepStrictEqual(view, { text: "rule deny file_read removed." });
    deepStrictEqual(rules(), ["deny:shell_command"]);
    deepStrictEqual(gate.list(), ["deny shell_command", ...MEMORY_LINES]);
  });

  it("refuses a text that is not a rule", async () => {
    // Arrange
    const { run } = permissionsHarness();

    // Act
    const view = await run("remove", "deny");

    // Assert
    deepStrictEqual(view, GRAMMAR);
  });

  it("clears every rule, in the session and in the gate", async () => {
    // Arrange
    const { gate, run, rules, seedRules } = permissionsHarness();
    seedRules("deny:file_read");
    gate.rules = [{ effect: "deny", tool: "file_read" }];

    // Act
    const view = await run("clear");

    // Assert
    deepStrictEqual(view, { text: "all permission rules cleared (the mode decides alone)." });
    deepStrictEqual(rules(), []);
    deepStrictEqual(gate.calls, ["clear", ...MEMORY_GATE]);
    deepStrictEqual(gate.list(), MEMORY_LINES);
  });

  it("clears the session's rules and says so when the host keeps none", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();
    gate.kept = false;

    // Act
    const view = await run("clear");

    // Assert
    deepStrictEqual(view, {
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
    // Arrange
    const { run, extraTools } = permissionsHarness();
    await extraTools("transcribe_audio:read, search_issues, gone:read, bad:exec", "transcribe_audio", "search_issues");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("default", EXTRAS), ...MEMORY_TOOLS].join(", ")}`);
    // spawn_agent is in no catalogue, yet no mode withholds it: the script host appends it to every act.
    strictEqual(lines[4], "  ↳ withheld by mode : (none)");
    strictEqual(lines[6],
      "  ↳ extra tools      : transcribe_audio (read), search_issues (write); not registered: gone (read); ignored: bad:exec");
    strictEqual(lines.length, 21);
  });

  it("withholds a write extra tool in a mode that offers only the read ones", async () => {
    // Arrange
    const { store, run, extraTools } = permissionsHarness();
    await extraTools("transcribe_audio:read, search_issues, gone:read, bad:exec", "transcribe_audio", "search_issues");
    store.state.set(DEFAULT_MODE_STATE_KEY, "dontAsk");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[3], `tool catalogue       : ${[...toolsetFor("dontAsk", EXTRAS), "memory_recall"].join(", ")}`);
    ok(lines[3].includes("transcribe_audio") && !lines[3].includes("search_issues"), lines[3]);
    ok(lines[4].endsWith(", search_issues"), lines[4]);
  });

  it("accepts a rule on a configured extra tool, saying its arguments are not known here", async () => {
    // Arrange
    const { run, extraTools } = permissionsHarness();
    await extraTools("search_issues gone_tool:read", "search_issues");

    // Act
    const lines = (await run("add", "deny", "search_issues", "query=secret*")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "rule deny search_issues query=secret* added.");
    ok(lines[1].startsWith("⚠ the arguments of 'search_issues' are not known here"), lines[1]);
    strictEqual(lines[2], `catalogue for 'default': ${toolsetFor("default", [EXTRAS[1]]).join(", ")}`);
  });

  it("accepts a rule on a configured extra tool the host does not register, and hands the gate both", async () => {
    // Arrange
    const { gate, run, rules, extraTools } = permissionsHarness();
    await extraTools("search_issues gone_tool:read", "search_issues");
    await run("add", "deny", "search_issues", "query=secret*");

    // Act
    const view = await run("add", "allow", "gone_tool");

    // Assert
    strictEqual(view.text!.split("\n")[0], "rule allow gone_tool added.");
    deepStrictEqual(rules(), ["deny search_issues query=secret*", "allow gone_tool"]);
    deepStrictEqual(gate.list(), ["deny search_issues query=secret*", "allow gone_tool", ...MEMORY_LINES]);
  });

  it("refuses a rule on a tool tools.extra never listed, naming the configured ones", async () => {
    // Arrange
    const { run } = await extraRulesSession();

    // Act
    const view = await run("add", "deny", "never_configured");

    // Assert
    deepStrictEqual(view, {
      text: "invalid rule: 'never_configured' is no tool a rule may name: one of " +
        `${[...RULEABLE_TOOLS, "search_issues", "gone_tool"].join(", ")}.\n${PERMISSIONS_USAGE}`,
    });
  });

  it("removes a rule on an extra tool", async () => {
    // Arrange
    const { run } = await extraRulesSession();

    // Act
    const view = await run("remove", "allow", "gone_tool");

    // Assert
    deepStrictEqual(view, { text: "rule allow gone_tool removed." });
  });

  it("lists the rules left on the extra tools", async () => {
    // Arrange
    const { run } = await extraRulesSession();
    await run("remove", "allow", "gone_tool");

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view.table, [
      { effect: "deny", tool: "search_issues", calls: "query=secret*", state: "enforced" },
    ]);
  });

  it("hands the gate a rule on a listed extra tool", async () => {
    // Arrange
    const { gate, run, extraTools } = permissionsHarness();
    await extraTools("create_issue", "create_issue");

    // Act
    await run("add", "deny", "create_issue");

    // Assert
    deepStrictEqual(gate.list(), ["deny create_issue", ...MEMORY_LINES]);
  });

  it("says a rule is dormant once its tool leaves tools.extra", async () => {
    // Arrange
    const { run } = await leftToolsExtraSession();

    // Act
    const lines = (await run("add", "deny", "http_api")).text!.split("\n");

    // Assert
    deepStrictEqual(lines.slice(-1), [dormant("deny create_issue")]);
  });

  it("keeps a dormant rule stored and out of the gate through every change", async () => {
    // Arrange
    const { gate, run, rules } = await leftToolsExtraSession();
    await run("add", "deny", "http_api");
    await run("remove", "deny", "http_api");

    // Act
    await run("add", "allow", "file_write");

    // Assert
    deepStrictEqual(rules(), ["deny create_issue", "allow file_write"]);
    deepStrictEqual(gate.list(), ["allow file_write", ...MEMORY_LINES]);
  });

  it("shows a dormant rule apart, and says why", async () => {
    // Arrange
    const { run } = await dormantRuleSession();

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[7], "session rules        : allow file_write; dormant: deny create_issue");
    ok(lines.includes(dormant("deny create_issue")), lines.join("\n"));
  });

  it("lists a dormant rule as dormant", async () => {
    // Arrange
    const { run } = await dormantRuleSession();

    // Act
    const view = await run("list");

    // Assert
    deepStrictEqual(view.table, [
      { effect: "allow", tool: "file_write", calls: "every call", state: "enforced" },
      { effect: "deny", tool: "create_issue", calls: "every call", state: "dormant: not in tools.extra" },
    ]);
  });

  it("enforces a dormant rule again once its tool is listed again, without being re-added", async () => {
    // Arrange
    const { gate, run, rules, extraTools } = await dormantRuleSession();
    // Listed again: the rule is enforced again, without being re-added.
    await extraTools("create_issue", "create_issue");

    // Act
    await run("remove", "allow", "file_write");

    // Assert
    deepStrictEqual(rules(), ["deny create_issue"]);
    deepStrictEqual(gate.list(), ["deny create_issue", ...MEMORY_LINES]);
  });

  it("removes a dormant rule by name", async () => {
    // Arrange
    const { run, rules, seedRules } = permissionsHarness();
    seedRules("deny create_issue", "deny file_write", "bogus");

    // Act
    const view = await run("remove", "deny", "create_issue");

    // Assert
    deepStrictEqual(view, {
      text: "rule deny create_issue removed.\n⚠ 1 stored entry is not a rule (bogus): kept as written, ignored; " +
        "/permissions clear removes them.",
    });
    deepStrictEqual(rules(), ["deny file_write", "bogus"]);
  });

  it("clears a dormant rule with the rest", async () => {
    // Arrange
    const { gate, run, rules, seedRules } = permissionsHarness();
    seedRules("deny create_issue", "deny file_write", "bogus");
    await run("remove", "deny", "create_issue");

    // Act
    await run("clear");

    // Assert
    deepStrictEqual(rules(), []);
    deepStrictEqual(gate.list(), MEMORY_LINES);
  });

  it("rewrites no rule away when tools.extra cannot be read, and says why the extra tools are unknown", async () => {
    // Arrange
    const { store, gate, seedRules } = permissionsHarness();
    seedRules("deny create_issue", "deny file_write");
    const run = unreadableConfigRun(store, gate);

    // Act
    const lines = (await run("add", "deny", "http_api")).text!.split("\n");

    // Assert
    ok(lines.includes(
      `⚠ tools.extra could not be read (${WORKSPACE}/.orkeon/config.json could not be read or parsed): no extra tool ` +
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
    // Arrange
    const { files, run } = permissionsHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "acceptEdits" }));

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "session default mode : acceptEdits ");
    strictEqual(lines[1], `  ↳ source           : ${resolveFallbackMode("acceptEdits").explanation}`);
    strictEqual(lines[2],
      "  ↳ ignored          : the project file sets permissions.fallback 'bypassPermissions': a project file may set " +
      "only default, plan or acceptEdits; another mode comes from the user settings (orkeonCode) or /mode");
  });

  it("names a mode written nested in the project file, which nothing reads", async () => {
    // Arrange
    const { files, run } = permissionsHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ permissions: { fallback: "bypassPermissions" } }));

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "session default mode : default ");
    ok(lines.includes(
      '⚠ permissions.fallback is written nested in a settings file ({"permissions": {…}}), so nothing reads it: ' +
        'write it flat, "permissions.fallback": ….'), lines.join("\n"));
  });

  it("runs the built-in default when the user settings set no mode", async () => {
    // Arrange
    const { files, run } = permissionsHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "permissions.fallback": "bypassPermissions" }));

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    strictEqual(lines[0], "session default mode : default ");
    ok(lines[2].startsWith("  ↳ ignored          : the project file sets permissions.fallback 'bypassPermissions'"), lines[2]);
  });

  it("does not offer a project's extra tool the user settings do not list, and names it", async () => {
    // Arrange
    const { files, catalogue, run } = permissionsHarness();
    files.files.set(CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues, deploy_prod" }));
    files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": "search_issues" }));
    catalogue.tools.set("search_issues", "");
    catalogue.tools.set("deploy_prod", "");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    ok(lines[3].includes("search_issues") && !lines[3].includes("deploy_prod"), lines[3]);
    ok(lines.includes(
      "⚠ tools.extra of the project file names deploy_prod:write, which the user settings do not allow " +
        "(orkeonCode tools.extra, or *): not offered.",
    ), lines.join("\n"));
  });

  it("says when the user settings cannot be read", async () => {
    // Arrange
    const { files, run } = permissionsHarness();
    files.files.set(USER_CONFIG_FILE_PATH, "{ oops");

    // Act
    const lines = (await run("show")).text!.split("\n");

    // Assert
    ok(lines.includes(
      `⚠ the user settings (${USER_CONFIG_FILE_PATH}) could not be read or parsed: no user setting applies.`,
    ), lines.join("\n"));
  });
});

describe("/permissions — anything else", () => {
  it("answers the usage line", async () => {
    // Arrange
    const { run } = permissionsHarness();

    // Act
    const view = await run("grant");

    // Assert
    deepStrictEqual(view, { text: PERMISSIONS_USAGE });
  });

  it("states the rule grammar in the usage line", () => {
    // Arrange
    const expected = USAGE_TEXT;

    // Act
    const usage = PERMISSIONS_USAGE;

    // Assert
    strictEqual(usage, expected);
  });
});

describe("/permissions show: the host gate's state", () => {
  it("warns when the host says its gate is off: nothing above is enforced", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();
    gate.hostGate = false;

    // Act
    const lines = (await run()).text!.split("\n");

    // Assert
    deepStrictEqual(lines.slice(18), GATE_OFF);
  });

  it("falls back to the setting's description when the host cannot say", async () => {
    // Arrange
    const { gate, run } = permissionsHarness();
    gate.hostGate = undefined;

    // Act
    const lines = (await run()).text!.split("\n");

    // Assert
    deepStrictEqual(lines.slice(18), GATE_SETTING);
  });
});
