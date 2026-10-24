// Run: node --test src/shared/domain/agent-policy/permission.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import {
  READ_TOOLS, WRITE_TOOLS, NETWORK_READ_TOOLS, RULEABLE_TOOLS, ACT_TOOLS, SCRIPT_TOOLS, scriptToolAccess,
  MEMORY_TOOLS, scriptToolsFor,
  resolvePermissionMode, isReadOnly,
  toolsetFor, permissionNote, buildActPrompt,
  catalogueFor, coversEveryCall, readRule, checkRule, formatRule, gateLine, parseStoredRule, sameCalls,
  ruleableTool, TOOL_ARGUMENTS, globMatches, matchesRule, ruleDecision,
} from "./permission.ts";
import { PERMISSION_MODES } from "../permission-modes.ts";

/** Each tool of `interface OrkeonBuiltInTools` (src/crews/.orkeon/orkeon.d.ts) with the depth-1 keys of
 *  its input: a ``/** `name` - …`` line, then `camel(input…{` and its keys until the brace closes, or
 *  `input?: Record<string, never>` for none. */
function builtInToolInputs(): Map<string, string[]> {
  const text = readFileSync(new URL("../../../crews/.orkeon/orkeon.d.ts", import.meta.url), "utf8");
  const lines = text.slice(text.indexOf("interface OrkeonBuiltInTools {")).split("\n");
  const tools = new Map<string, string[]>();
  for (let i = 1; i < lines.length && lines[i] !== "}"; i++) {
    const name = /^\/\*\* `([a-z_0-9]+)` - /.exec(lines[i])?.[1];
    if (name === undefined) continue;
    const head = lines[++i];
    const keys: string[] = [];
    tools.set(name, keys);
    if (!/\(input\??: \{$/.test(head.trimEnd())) continue;
    for (let depth = 1; ++i < lines.length;) {
      const line = lines[i];
      if (depth === 1 && line.startsWith("}")) break;
      if (/^\s*(\/\*\*|\*)/.test(line)) continue;
      const key = /^\s*([a-z_0-9]+)\??:/.exec(line)?.[1];
      if (depth === 1 && key !== undefined) keys.push(key);
      depth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    }
  }
  return tools;
}

describe("resolvePermissionMode", () => {
  it("defaults to 'default'", () => {
    strictEqual(resolvePermissionMode(undefined), "default");
    strictEqual(resolvePermissionMode("plan"), "plan");
  });
});

describe("toolsetFor", () => {
  it("plan mode is read-only (no write/shell)", () => {
    const t = toolsetFor("plan");
    strictEqual(t.includes("file_write"), false);
    strictEqual(t.includes("shell_command"), false);
    for (const r of READ_TOOLS) ok(t.includes(r));
  });
  it("dontAsk mode is read-only like plan (E-3)", () => {
    const t = toolsetFor("dontAsk");
    strictEqual(t.includes("file_write"), false);
    strictEqual(t.includes("shell_command"), false);
    for (const r of READ_TOOLS) ok(t.includes(r));
  });
  it("default, acceptEdits and bypassPermissions offer every mutating tool (the gate asks)", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) {
      const t = toolsetFor(mode);
      for (const w of WRITE_TOOLS) ok(t.includes(w), `${mode} should include ${w}`);
    }
  });
});

describe("B-8 — the network-read class", () => {
  // The classification matrix, pinned per mode. A network read mutates nothing
  // locally but reaches out, so it follows the write side, not the read side.
  const MATRIX: Array<[string, boolean]> = [
    ["default", true],
    ["acceptEdits", true],
    ["bypassPermissions", true],
    ["plan", false],
    ["dontAsk", false],
  ];

  for (const [mode, expected] of MATRIX) {
    it(`${mode} ${expected ? "grants" : "withholds"} every network-read tool`, () => {
      const t = toolsetFor(mode);
      for (const n of NETWORK_READ_TOOLS) {
        strictEqual(t.includes(n), expected, `${mode} / ${n}`);
      }
    });
  }

  it("names only tools the host actually registers", () => {
    // Verified in the live REPL (Object.keys(tools), 57 registered): `.tools([...])`
    // matches by name and silently drops the rest, so a typo here would produce a
    // catalogue that looks wired and hands over nothing.
    deepStrictEqual(NETWORK_READ_TOOLS, ["http_api", "web_scrape", "scrape_element"]);
  });

  it("does NOT wire the A2A tools — they are not in the DI catalogue", () => {
    // DelegateWorkTool is built per-agent by AgentDelegationToolsProvider and never
    // registered as IBaseTool, so naming it would be a silent no-op. Pinned so the
    // next reader does not "fix" it.
    for (const absent of ["delegate_work", "delegate_work_to_coworker", "search_tool"]) {
      strictEqual(toolsetFor("bypassPermissions").includes(absent), false, absent);
      strictEqual(RULEABLE_TOOLS.includes(absent), false, `${absent} must not be ruleable either`);
    }
  });

  it("makes spawn_agent ruleable but offers it in no catalogue: the script host appends it to every act", () => {
    strictEqual(RULEABLE_TOOLS.includes("spawn_agent"), true);
    deepStrictEqual(ACT_TOOLS, ["spawn_agent"]);
    for (const mode of PERMISSION_MODES) strictEqual(toolsetFor(mode).includes("spawn_agent"), false, mode);
  });

  it("makes the network tools ruleable, so /permissions can deny them", () => {
    for (const n of NETWORK_READ_TOOLS) ok(RULEABLE_TOOLS.includes(n), n);
    const decision = catalogueFor("default", [{ effect: "deny", tool: "http_api" }]);
    strictEqual(decision.tools.includes("http_api"), false);
    deepStrictEqual(decision.deniedByRule, ["http_api"]);
  });
});

describe("the tool lists", () => {
  it("name each tool once: the write and ruleable lists derive from the classes", () => {
    deepStrictEqual(WRITE_TOOLS, [
      "file_write", "rag_ingest", "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch",
      "structural_rewrite", "github", "rag_eval", "shell_command",
    ]);
    deepStrictEqual(RULEABLE_TOOLS, [
      ...READ_TOOLS, ...NETWORK_READ_TOOLS, ...WRITE_TOOLS, ...ACT_TOOLS, ...SCRIPT_TOOLS.map((t) => t.name),
    ]);
    strictEqual(new Set(RULEABLE_TOOLS).size, RULEABLE_TOOLS.length);
  });

  it("offer every ruleable tool but ACT_TOOLS and SCRIPT_TOOLS in some mode, and nothing else", () => {
    const offered = new Set(PERMISSION_MODES.flatMap((mode) => toolsetFor(mode)));
    const attached = (t: string) => ACT_TOOLS.includes(t) || scriptToolAccess(t) !== undefined;
    deepStrictEqual([...offered].sort(), RULEABLE_TOOLS.filter((t) => !attached(t)).sort());
  });

  it("declare the access of Orkeon Code's own tools: the validation reads, the test run and the build execute", () => {
    deepStrictEqual(SCRIPT_TOOLS, [
      { name: "run_validation", access: "read" },
      { name: "run_tests", access: "execute" },
      { name: "run_build", access: "execute" },
      { name: "memory_recall", access: "read" },
      { name: "memory_push", access: "edit" },
    ]);
    strictEqual(scriptToolAccess("RUN_TESTS"), "execute");
    strictEqual(scriptToolAccess("shell_command"), undefined);
    deepStrictEqual(TOOL_ARGUMENTS.run_validation, ["command"]);
    deepStrictEqual(TOOL_ARGUMENTS.run_build, ["project"]);
  });

  it("offer the shared memory's recall in every mode and its push only where the mode edits (M-5)", () => {
    for (const mode of PERMISSION_MODES) {
      deepStrictEqual(scriptToolsFor(mode, MEMORY_TOOLS), isReadOnly(mode) ? ["memory_recall"] : ["memory_recall", "memory_push"], mode);
    }
    deepStrictEqual(scriptToolsFor("plan", ["run_tests", "run_validation", "file_read"]), ["run_validation"]);
    deepStrictEqual(scriptToolsFor("default", ["run_tests", "run_build"]), ["run_tests", "run_build"]);
  });

  it("leave out a script tool a deny rule covers whole, never one an argument pattern narrows", () => {
    deepStrictEqual(scriptToolsFor("acceptEdits", MEMORY_TOOLS, [{ effect: "deny", tool: "MEMORY_PUSH" }]), ["memory_recall"]);
    deepStrictEqual(scriptToolsFor("plan", MEMORY_TOOLS, [{ effect: "deny", tool: "memory_recall" }]), []);
    deepStrictEqual(
      scriptToolsFor("default", MEMORY_TOOLS, [{ effect: "deny", tool: "memory_push", argument: "topic", pattern: "auth*" }]),
      ["memory_recall", "memory_push"],
    );
    deepStrictEqual(scriptToolsFor("default", MEMORY_TOOLS, [{ effect: "allow", tool: "memory_push" }]), ["memory_recall", "memory_push"]);
  });

  it("take a rule on the shared memory's tools, on the arguments of their schemas", () => {
    deepStrictEqual(checkRule("deny memory_push topic=auth*"), {
      ok: true, rule: { effect: "deny", tool: "memory_push", argument: "topic", pattern: "auth*" },
    });
    strictEqual(checkRule("deny memory_recall query=x").ok, true);
    strictEqual(checkRule("deny memory_recall path=x").ok, false);
  });

  it("take a rule on one of Orkeon Code's own tools, on the argument it takes", () => {
    deepStrictEqual(checkRule("deny run_tests command=dotnet test*"), {
      ok: true, rule: { effect: "deny", tool: "run_tests", argument: "command", pattern: "dotnet test*" },
    });
    strictEqual(checkRule("deny run_build command=x").ok, false);
  });

  it("offer the reads of Orkeon #180 in every mode and its edit tools only where the mode edits", () => {
    const reads = [
      "glob", "grep", "list_mounts", "node_outline", "node_read", "count_pattern", "access_cost", "affected_tests",
      "batch_anchors", "documented_in", "documents_of", "structural_search", "incremental_reindex",
      "statement_query", "complexity_report",
    ];
    const edits = [
      "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch", "structural_rewrite", "github",
      "rag_eval",
    ];
    for (const mode of PERMISSION_MODES) {
      const t = toolsetFor(mode);
      for (const r of reads) ok(t.includes(r), `${mode} / ${r}`);
      for (const e of edits) strictEqual(t.includes(e), !isReadOnly(mode), `${mode} / ${e}`);
    }
  });

  it("know the arguments orkeon.d.ts declares for every ruleable tool but spawn_agent and SCRIPT_TOOLS", () => {
    const declared = builtInToolInputs();
    const own = (tool: string) => tool === "spawn_agent" || scriptToolAccess(tool) !== undefined;
    for (const [tool, args] of Object.entries(TOOL_ARGUMENTS)) {
      if (own(tool)) continue;
      ok(declared.has(tool), `${tool} is not declared in OrkeonBuiltInTools`);
      deepStrictEqual([...args].sort(), [...declared.get(tool)!].sort(), tool);
    }
    for (const tool of RULEABLE_TOOLS) if (!own(tool)) ok(declared.has(tool), tool);
    deepStrictEqual(TOOL_ARGUMENTS.spawn_agent, ["agent", "input"]);
  });

  it("know the arguments of every ruleable tool, and of no other", () => {
    deepStrictEqual(Object.keys(TOOL_ARGUMENTS).sort(), [...RULEABLE_TOOLS].sort());
    for (const [tool, args] of Object.entries(TOOL_ARGUMENTS)) {
      strictEqual(new Set(args).size, args.length, tool);
      for (const arg of args) ok(/^[a-z][a-z0-9_]*$/.test(arg), `${tool}.${arg} is snake_case`);
    }
    deepStrictEqual(TOOL_ARGUMENTS.shell_command, [
      "command", "working_directory", "timeout_seconds", "action", "job_id", "tail_lines",
    ]);
    deepStrictEqual(TOOL_ARGUMENTS.file_write, ["path", "content", "encoding", "append", "create_backup"]);
  });
});

describe("isReadOnly", () => {
  it("plan and dontAsk are read-only, the rest are not", () => {
    strictEqual(isReadOnly("plan"), true);
    strictEqual(isReadOnly("dontAsk"), true);
    strictEqual(isReadOnly("default"), false);
    strictEqual(isReadOnly("acceptEdits"), false);
    strictEqual(isReadOnly("bypassPermissions"), false);
  });
});

describe("permissionNote / buildActPrompt", () => {
  it("plan note forbids mutation and asks for an assessment or a plan", () => {
    ok(permissionNote("plan").includes("MUST NOT modify"));
    ok(permissionNote("plan").includes("an assessment or a plan"));
  });
  it("dontAsk note forbids mutation", () => {
    ok(permissionNote("dontAsk").includes("MUST NOT modify"));
  });
  it("every writing mode's note allows edits and shell, acceptEdits included", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) {
      strictEqual(
        permissionNote(mode),
        `(Permission mode: ${mode}. You may edit files, run shell commands and fetch over the network; ` +
          "the host may ask the user before a call.)",
      );
    }
  });
  it("the note tracks the network class it grants or withholds", () => {
    // The catalogue is the enforcement; the note is what the model is told. The
    // two drifting apart is how a model spends a turn planning a fetch it cannot make.
    ok(permissionNote("plan").includes("fetch anything over the network"));
    ok(permissionNote("acceptEdits").includes("fetch over the network"));
    ok(permissionNote("default").includes("fetch over the network"));
  });
  it("buildActPrompt appends the note after the prompt", () => {
    const p = buildActPrompt("do X", "plan");
    ok(p.startsWith("do X\n\n"));
    ok(p.includes("Permission mode: plan"));
  });
});

// ── The session's rules: the gate enforces them, the catalogue drops whole-tool denies ──

const NPM_TEST = { effect: "allow" as const, tool: "shell_command", argument: "command", pattern: "npm test*" };
const GIT_PUSH = { effect: "deny" as const, tool: "shell_command", argument: "command", pattern: "git push*" };

describe("catalogueFor", () => {
  it("a whole-tool deny on file_write removes it from EVERY mode's catalogue", () => {
    const rules = [{ effect: "deny" as const, tool: "file_write" }];
    for (const mode of ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"]) {
      const d = catalogueFor(mode, rules);
      strictEqual(d.tools.includes("file_write"), false, mode);
    }
  });

  it("reports which removals came from a rule, so /permissions can distinguish them", () => {
    // A catalogue missing file_write because of `plan` and one missing it because
    // of a deny rule look identical from the tool list alone.
    const denied = catalogueFor("default", [{ effect: "deny", tool: "file_write" }]);
    deepStrictEqual(denied.deniedByRule, ["file_write"]);

    const byMode = catalogueFor("plan", []);
    deepStrictEqual(byMode.deniedByRule, [], "plan withholds by mode, not by rule");
    strictEqual(byMode.tools.includes("file_write"), false);
  });

  it("deny wins in bypassPermissions too — tightening is never overridable", () => {
    const d = catalogueFor("bypassPermissions", [{ effect: "deny", tool: "shell_command" }]);
    strictEqual(d.tools.includes("shell_command"), false);
  });

  it("deny on a tool the mode already withholds is a no-op, not a phantom removal", () => {
    const d = catalogueFor("plan", [{ effect: "deny", tool: "shell_command" }]);
    deepStrictEqual(d.deniedByRule, [], "nothing was removed — plan never had it");
  });

  it("leaves the tool of an argument-scoped deny offered: the gate refuses the matching calls only", () => {
    const d = catalogueFor("acceptEdits", [GIT_PUSH]);
    deepStrictEqual(d.tools, toolsetFor("acceptEdits"));
    deepStrictEqual(d.deniedByRule, []);
  });

  it("never adds a tool for an allow rule: an allow spares a question, it hands nothing over", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"]) {
      const d = catalogueFor(mode, [{ effect: "allow", tool: "file_write" }, NPM_TEST]);
      deepStrictEqual(d.tools, toolsetFor(mode), mode);
    }
  });

  it("reports an allow rule on a tool a read-only mode does not offer as inert, and says why", () => {
    // `plan` and `dontAsk` being read-only BY CONSTRUCTION is what /commit's
    // refusal and the prompt note rest on: the catalogue keeps the promise, the
    // rule loses — loudly.
    const d = catalogueFor("dontAsk", [{ effect: "allow", tool: "file_write" }, NPM_TEST]);
    deepStrictEqual(d.inert.map((r) => r.rule.tool), ["file_write", "shell_command"]);
    ok(d.inert[0].reason.includes("mode 'dontAsk' does not offer 'file_write'"), d.inert[0].reason);
    ok(d.inert[0].reason.includes("Switch mode"), "the report must say what to do instead");
  });

  it("reports EVERY allow rule as inert in plan, whose gate reads none, offered tool or not", () => {
    const rules = [
      { effect: "allow" as const, tool: "file_read" }, { effect: "allow" as const, tool: "file_write" }, NPM_TEST,
      { effect: "deny" as const, tool: "http_api" },
    ];
    const d = catalogueFor("plan", rules);
    deepStrictEqual(d.inert.map((r) => r.rule.tool), ["file_read", "file_write", "shell_command"]);
    for (const r of d.inert) {
      ok(r.reason.startsWith("mode 'plan' ignores every allow rule"), r.reason);
      ok(r.reason.includes("Switch mode"), r.reason);
    }
  });

  it("reports an allow rule on spawn_agent as inert in plan only: every act is offered it", () => {
    const allow = [{ effect: "allow" as const, tool: "spawn_agent" }];
    for (const mode of PERMISSION_MODES) {
      deepStrictEqual(catalogueFor(mode, allow).inert.map((r) => r.rule.tool), mode === "plan" ? ["spawn_agent"] : [], mode);
    }
  });

  it("warns on an allow rule on spawn_agent, which runs without asking in dontAsk too, and refuses nothing", () => {
    const warning = "'spawn_agent' is offered to every act whatever the mode: an allow rule lets it run without " +
      "asking in dontAsk too.";
    deepStrictEqual(checkRule("allow spawn_agent"), { ok: true, rule: { effect: "allow", tool: "spawn_agent" }, warning });
    deepStrictEqual(checkRule("allow Spawn_Agent agent=researcher"), {
      ok: true, rule: { effect: "allow", tool: "spawn_agent", argument: "agent", pattern: "researcher" }, warning,
    });
    deepStrictEqual(checkRule("deny spawn_agent"), { ok: true, rule: { effect: "deny", tool: "spawn_agent" } });
  });

  it("reports no inert rule where the mode offers the tool and reads allow rules", () => {
    deepStrictEqual(catalogueFor("default", [{ effect: "allow", tool: "file_write" }, NPM_TEST]).inert, []);
    deepStrictEqual(catalogueFor("dontAsk", [{ effect: "allow", tool: "file_read" }]).inert, []);
  });

  it("no rules leaves the mode catalogue byte-identical", () => {
    for (const mode of ["default", "acceptEdits", "bypassPermissions", "plan", "dontAsk"]) {
      deepStrictEqual(catalogueFor(mode, []).tools, toolsetFor(mode), mode);
    }
  });
});

describe("rule grammar (readRule)", () => {
  it("reads `<effect> <tool>`, any tool: the tool is checked apart", () => {
    deepStrictEqual(readRule("deny file_write"), { effect: "deny", tool: "file_write" });
    deepStrictEqual(readRule("  ALLOW   shell_command "), { effect: "allow", tool: "shell_command" });
    deepStrictEqual(readRule("deny nope"), { effect: "deny", tool: "nope" });
    strictEqual(readRule("maybe file_write"), null);
    strictEqual(readRule("deny"), null);
    strictEqual(readRule(""), null);
    strictEqual(readRule(null), null);
  });

  it("reads an argument pattern, the rest of the text after `=`, spaces included", () => {
    deepStrictEqual(readRule("allow shell_command command=npm test*"), NPM_TEST);
    deepStrictEqual(readRule("deny shell_command command=git push*"), GIT_PUSH);
    deepStrictEqual(readRule("deny file_write path=/workspace/a=b"), {
      effect: "deny", tool: "file_write", argument: "path", pattern: "/workspace/a=b",
    });
  });

  it("takes one pair of matching quotes off the pattern, and only one", () => {
    deepStrictEqual(readRule('allow shell_command command="npm test*"'), NPM_TEST);
    deepStrictEqual(readRule("allow shell_command command='npm test*'"), NPM_TEST);
    deepStrictEqual(readRule('deny shell_command command=""x""')?.pattern, '"x"');
    deepStrictEqual(readRule("deny shell_command command=\"x'")?.pattern, "\"x'");
    deepStrictEqual(readRule('deny shell_command command="')?.pattern, '"');
    deepStrictEqual(readRule('deny shell_command command=a"b"')?.pattern, 'a"b"');
    strictEqual(readRule('deny shell_command command=""'), null, "a quoted empty pattern is no pattern");
  });

  it("refuses a scope without an argument name or without a pattern", () => {
    for (const bad of [
      "allow shell_command npm test", "allow shell_command =npm*", "allow shell_command command=",
      "allow shell_command com mand=npm", "allow shell_command 1st=x",
    ]) {
      strictEqual(readRule(bad), null, bad);
    }
  });

  it("reads the `effect:tool` form stored before rules took patterns", () => {
    deepStrictEqual(readRule("deny:shell_command"), { effect: "deny", tool: "shell_command" });
    deepStrictEqual(readRule("allow:http_api"), { effect: "allow", tool: "http_api" });
    for (const junk of ["", "deny", "deny:", ":file_write", "yolo:file_write", "deny:file_write:x", null, 7]) {
      strictEqual(readRule(junk), null, String(junk));
    }
  });

  it("formats a rule as the host gate lists it, and reads it back", () => {
    strictEqual(formatRule({ effect: "deny", tool: "file_write" }), "deny file_write");
    strictEqual(formatRule(NPM_TEST), "allow shell_command command=npm test*");
    for (const rule of [{ effect: "deny" as const, tool: "file_write" }, NPM_TEST, GIT_PUSH]) {
      strictEqual(formatRule(rule), gateLine(rule));
      deepStrictEqual(readRule(formatRule(rule)), rule);
    }
  });

  it("quotes a pattern that starts and ends with a quote once more, so it reads back as written", () => {
    for (const pattern of ['"x"', "'x'", '"', "''"]) {
      const rule = { effect: "deny" as const, tool: "shell_command", argument: "command", pattern };
      deepStrictEqual(readRule(formatRule(rule)), rule, pattern);
    }
    strictEqual(gateLine({ ...GIT_PUSH, pattern: '"x"' }), 'deny shell_command command="x"');
  });

  it("tells the rules that cover every call from the scoped ones, and which cover the same calls", () => {
    strictEqual(coversEveryCall({ effect: "deny", tool: "file_write" }), true);
    strictEqual(coversEveryCall(NPM_TEST), false);
    strictEqual(sameCalls(NPM_TEST, { ...NPM_TEST, effect: "deny" }), true);
    strictEqual(sameCalls(NPM_TEST, { ...NPM_TEST, tool: "Shell_Command" }), true, "tool names compare case aside");
    strictEqual(sameCalls(NPM_TEST, GIT_PUSH), false);
    strictEqual(sameCalls({ effect: "deny", tool: "shell_command" }, GIT_PUSH), false);
  });
});

describe("stored rules (parseStoredRule)", () => {
  it("reads a rule on a known tool, in that tool's spelling, both stored forms", () => {
    deepStrictEqual(parseStoredRule("deny:shell_command"), { effect: "deny", tool: "shell_command" });
    deepStrictEqual(parseStoredRule("allow SHELL_COMMAND command=npm test*"), NPM_TEST);
    for (const rule of [{ effect: "deny" as const, tool: "file_write" }, NPM_TEST, GIT_PUSH]) {
      deepStrictEqual(parseStoredRule(formatRule(rule)), rule);
    }
  });

  it("reads no rule from an unknown tool or a corrupted entry", () => {
    for (const junk of ["deny nope", "deny:nope", "", "deny", "yolo:file_write", null, 7]) {
      strictEqual(parseStoredRule(junk), null, String(junk));
    }
  });
});

describe("rules to add (checkRule)", () => {
  const SYNTAX = "expected <deny|allow> <tool> [<argument>=<pattern>]";

  it("accepts a rule on a built-in tool, every call or an argument it takes, in the tool's own spelling", () => {
    deepStrictEqual(checkRule("deny file_write"), { ok: true, rule: { effect: "deny", tool: "file_write" } });
    deepStrictEqual(checkRule("allow Shell_Command command=npm test*"), { ok: true, rule: NPM_TEST });
    deepStrictEqual(checkRule('allow shell_command command="npm test*"'), { ok: true, rule: NPM_TEST });
    deepStrictEqual(checkRule("deny file_write path=/workspace/secrets/*").ok, true);
  });

  it("refuses an argument a built-in tool does not take, naming the ones it does", () => {
    deepStrictEqual(checkRule("allow shell_command cmd=npm test*"), {
      ok: false, reason: "'shell_command' has no argument 'cmd': it takes command, working_directory, timeout_seconds, action, job_id, tail_lines",
    });
    deepStrictEqual(checkRule("deny shell_command Command=rm*"), {
      ok: false, reason: "'shell_command' has no argument 'Command': it takes command, working_directory, timeout_seconds, action, job_id, tail_lines",
    });
    deepStrictEqual(checkRule("deny index_status path=x"), {
      ok: false, reason: "'index_status' takes no argument: a rule on it covers every call",
    });
  });

  it("accepts an argument of an extra tool, with a warning: its arguments are not known here", () => {
    const check = checkRule("deny search_issues query=secret*", ["search_issues"]);
    strictEqual(check.ok, true);
    if (!check.ok) return;
    deepStrictEqual(check.rule, { effect: "deny", tool: "search_issues", argument: "query", pattern: "secret*" });
    ok(check.warning?.startsWith("the arguments of 'search_issues' are not known here"), check.warning);
    ok(check.warning?.includes("named exactly 'query'"), check.warning);
    deepStrictEqual(checkRule("deny search_issues", ["search_issues"]), {
      ok: true, rule: { effect: "deny", tool: "search_issues" },
    });
  });

  it("refuses a text that is not the grammar, and a tool that is neither built in nor configured", () => {
    deepStrictEqual(checkRule("permit file_read"), { ok: false, reason: SYNTAX });
    deepStrictEqual(checkRule("allow shell_command command="), { ok: false, reason: SYNTAX });
    deepStrictEqual(checkRule("deny nope", ["search_issues"]), {
      ok: false, reason: `'nope' is no tool a rule may name: one of ${[...RULEABLE_TOOLS, "search_issues"].join(", ")}`,
    });
  });
});

describe("extra tools (tools.extra)", () => {
  const READER = { name: "transcribe_audio", access: "read" as const };
  const WRITER = { name: "search_issues", access: "write" as const };

  it("offers a read extra tool in every mode, with the local reads", () => {
    for (const mode of ["plan", "dontAsk", "default", "acceptEdits", "bypassPermissions"]) {
      const t = toolsetFor(mode, [READER]);
      strictEqual(t.indexOf("transcribe_audio"), READ_TOOLS.length, mode);
    }
  });

  it("offers a write extra tool in the writing modes only, after the built-in classes", () => {
    for (const mode of ["plan", "dontAsk"]) strictEqual(toolsetFor(mode, [WRITER]).includes("search_issues"), false, mode);
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) {
      deepStrictEqual(toolsetFor(mode, [WRITER]), [...toolsetFor(mode), "search_issues"], mode);
    }
  });

  it("removes an extra tool a deny covers whole, and calls an allow on a withheld one inert", () => {
    const rules = [{ effect: "deny" as const, tool: "transcribe_audio" }, { effect: "allow" as const, tool: "search_issues" }];
    const plan = catalogueFor("plan", rules, [READER, WRITER]);
    deepStrictEqual(plan.deniedByRule, ["transcribe_audio"]);
    deepStrictEqual(plan.inert.map((r) => r.rule.tool), ["search_issues"]);
    deepStrictEqual(catalogueFor("default", rules, [READER, WRITER]).inert, []);
  });

  it("reads a stored rule on a tool the configured names hold, and only then, in their spelling", () => {
    strictEqual(parseStoredRule("deny search_issues"), null);
    deepStrictEqual(parseStoredRule("deny search_issues query=secret*", ["search_issues"]), {
      effect: "deny", tool: "search_issues", argument: "query", pattern: "secret*",
    });
    deepStrictEqual(parseStoredRule("allow:search_issues", ["search_issues"]), { effect: "allow", tool: "search_issues" });
    deepStrictEqual(parseStoredRule("deny Get-File-Contents", ["get-file-contents"]), {
      effect: "deny", tool: "get-file-contents",
    });
    strictEqual(parseStoredRule("allow:search_issues"), null);
  });

  it("names a built-in or configured tool in its own spelling, case aside", () => {
    strictEqual(ruleableTool("FILE_WRITE"), "file_write");
    strictEqual(ruleableTool("listissues", ["listIssues"]), "listIssues");
    strictEqual(ruleableTool("list_issues", ["listIssues"]), undefined);
  });
});

describe("rag_ingest, an edit as the host gate classifies it (Orkeon #126)", () => {
  it("is withheld from the read-only modes and offered with the edits", () => {
    for (const mode of ["plan", "dontAsk"]) strictEqual(toolsetFor(mode).includes("rag_ingest"), false, mode);
    for (const mode of ["default", "acceptEdits", "bypassPermissions"]) ok(toolsetFor(mode).includes("rag_ingest"), mode);
    ok(READ_TOOLS.includes("rag_search") && !READ_TOOLS.includes("rag_ingest"));
  });
});

describe("globMatches, matchesRule and ruleDecision", () => {
  const R = (text: string) => readRule(text)!;

  it("matches a pattern whole, `*` standing for any run, line breaks included", () => {
    strictEqual(globMatches("git push*", "git push"), true);
    strictEqual(globMatches("git push*", "git push origin main"), true);
    strictEqual(globMatches("git push", "git push --force"), false);
    strictEqual(globMatches("git push*", "xgit push"), false);
    strictEqual(globMatches("*BEGIN*", "a\nBEGIN\nb"), true);
    strictEqual(globMatches("*", ""), true);
  });

  it("reads every other character literally, case counting", () => {
    strictEqual(globMatches("a.b(c)*", "a.b(c)d"), true);
    strictEqual(globMatches("a.b(c)*", "axb(c)d"), false);
    strictEqual(globMatches("Git push*", "git push"), false);
    strictEqual(globMatches("a?c", "abc"), false);
  });

  it("covers a call by the tool, case aside, and by the argument named exactly", () => {
    const rule = R("deny shell_command command=git push*");
    strictEqual(matchesRule(rule, "Shell_Command", { command: "git push" }), true);
    strictEqual(matchesRule(rule, "shell_command", { Command: "git push" }), false);
    strictEqual(matchesRule(rule, "file_write", { command: "git push" }), false);
  });

  it("covers every call when the rule names no argument", () => {
    strictEqual(matchesRule(R("deny file_write"), "file_write", {}), true);
  });

  it("matches nothing when the argument is absent, null or not a scalar", () => {
    const rule = R("deny file_read path=*");
    for (const args of [{}, { path: null }, { path: ["a"] }, { path: { a: 1 } }]) {
      strictEqual(matchesRule(rule, "file_read", args), false, JSON.stringify(args));
    }
  });

  it("reads a number or a boolean as its text", () => {
    strictEqual(matchesRule(R("deny shell_command timeout_seconds=600"), "shell_command", { timeout_seconds: 600 }), true);
    strictEqual(matchesRule(R("deny file_write append=true"), "file_write", { append: true }), true);
  });

  it("lets a deny win over an allow on the same call, and leaves the rest to the mode", () => {
    const rules = [R("allow shell_command command=git *"), R("deny shell_command command=git push*")];
    strictEqual(ruleDecision(rules, "shell_command", { command: "git push" }), "deny");
    strictEqual(ruleDecision(rules, "shell_command", { command: "git status" }), "allow");
    strictEqual(ruleDecision(rules, "shell_command", { command: "npm test" }), undefined);
  });
});
