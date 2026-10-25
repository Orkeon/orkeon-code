// Run: node --test src/shared/domain/agent-policy/permission.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import {
  READ_TOOLS, WRITE_TOOLS, NETWORK_READ_TOOLS, RULEABLE_TOOLS, ACT_TOOLS, SCRIPT_TOOLS, scriptToolAccess,
  MEMORY_TOOLS, scriptToolsFor,
  resolvePermissionMode, isReadOnly,
  toolsetFor, permissionNote, buildActPrompt,
  catalogueFor, coversEveryCall, readRule, checkRule, formatRule, gateLine, parseStoredRule, sameCalls,
  ruleableTool, TOOL_ARGUMENTS, globMatches, matchesRule, ruleDecision, shellCommandForms, shellWords,
} from "./permission.ts";
import { PERMISSION_MODES } from "../permission-modes.ts";
import {
  A2A_TOOLS, ALL_MODES, builtInToolInputs, CHECK_RULE_CASES, CHECK_RULE_OK_CASES, DECISION_CASES, DENY_FILE_WRITE,
  EXTRA_RULES, FORMAT_CASES, GIT_PUSH, GIT_RULE_TEXTS, GLOB_CASES, MATCHES_RULE_CASES, NETWORK_MATRIX,
  NOTE_NETWORK_CASES, NPM_TEST, ORKEON_180_EDITS, ORKEON_180_READS, PARSE_STORED_CASES, PLAN_RULES,
  QUOTED_PATTERNS, READ_ONLY_CASES, READ_ONLY_MODES, READ_ONLY_TOOLSET_CASES, READ_PATTERN_CASES, READ_RULE_CASES,
  READER, RESOLVE_MODE_CASES, ROUND_TRIP_RULES, RULEABLE_TOOL_CASES, SAME_CALLS_CASES, SCRIPT_TOOL_ACCESS_CASES,
  SCRIPT_TOOLS_DECLARED, SCRIPT_TOOLS_FOR_CASES, SHELL_FORMS_CASES, SHELL_WORDS_CASES, TOOL_ARGUMENT_CASES,
  WRITE_TOOLS_IN_ORDER, WRITER, WRITING_MODES, writingNote,
} from "./permission.fixtures.ts";
import {
  assertAcceptedWithWarning, assertArgumentsDeclared, assertInertReasons, assertMentions, assertOffered,
  assertReadOnlyToolset, assertWellFormedArguments,
} from "./permission.assertions.ts";

describe("resolvePermissionMode", () => {
  for (const c of RESOLVE_MODE_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw } = c;

      // Act
      const mode = resolvePermissionMode(raw);

      // Assert
      strictEqual(mode, c.mode);
    });
  }
});

describe("toolsetFor", () => {
  for (const c of READ_ONLY_TOOLSET_CASES) {
    it(c.name, () => {
      // Arrange
      const { mode } = c;

      // Act
      const t = toolsetFor(mode);

      // Assert
      assertReadOnlyToolset(t, mode);
    });
  }

  for (const mode of WRITING_MODES) {
    it(`${mode} offers every mutating tool (the gate asks)`, () => {
      // Arrange
      const tools = WRITE_TOOLS;

      // Act
      const t = toolsetFor(mode);

      // Assert
      assertOffered(t, tools, true, mode);
    });
  }
});

describe("B-8 — the network-read class", () => {
  for (const [mode, expected] of NETWORK_MATRIX) {
    it(`${mode} ${expected ? "grants" : "withholds"} every network-read tool`, () => {
      // Arrange
      const tools = NETWORK_READ_TOOLS;

      // Act
      const t = toolsetFor(mode);

      // Assert
      assertOffered(t, tools, expected, mode);
    });
  }

  it("names only tools the host actually registers", () => {
    // Verified in the live REPL (Object.keys(tools), 57 registered): `.tools([...])`
    // matches by name and silently drops the rest, so a typo here would produce a
    // catalogue that looks wired and hands over nothing.
    // Arrange
    const expected = ["http_api", "web_scrape", "scrape_element"];

    // Act
    const names = NETWORK_READ_TOOLS;

    // Assert
    deepStrictEqual(names, expected);
  });

  // DelegateWorkTool is built per-agent by AgentDelegationToolsProvider and never
  // registered as IBaseTool, so naming it would be a silent no-op. Pinned so the
  // next reader does not "fix" it.
  for (const absent of A2A_TOOLS) {
    it(`does NOT wire the A2A tool ${absent} — it is not in the DI catalogue`, () => {
      // Arrange
      const mode = "bypassPermissions";

      // Act
      const t = toolsetFor(mode);

      // Assert
      strictEqual(t.includes(absent), false, absent);
      strictEqual(RULEABLE_TOOLS.includes(absent), false, `${absent} must not be ruleable either`);
    });
  }

  it("makes spawn_agent ruleable", () => {
    // Arrange
    const tools = RULEABLE_TOOLS;

    // Act
    const ruleable = tools.includes("spawn_agent");

    // Assert
    strictEqual(ruleable, true);
  });

  it("lists spawn_agent alone as the tool the script host appends to every act", () => {
    // Arrange
    const expected = ["spawn_agent"];

    // Act
    const tools = ACT_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  for (const mode of PERMISSION_MODES) {
    it(`offers spawn_agent in no catalogue, ${mode}'s included: the script host appends it to every act`, () => {
      // Arrange
      const tool = "spawn_agent";

      // Act
      const t = toolsetFor(mode);

      // Assert
      strictEqual(t.includes(tool), false, mode);
    });
  }

  it("makes the network tools ruleable", () => {
    // Arrange
    const tools = NETWORK_READ_TOOLS;

    // Act
    const unruleable = tools.filter((n) => !RULEABLE_TOOLS.includes(n));

    // Assert
    deepStrictEqual(unruleable, []);
  });

  it("lets a deny rule remove a network tool, so /permissions can deny them", () => {
    // Arrange
    const rules = [{ effect: "deny" as const, tool: "http_api" }];

    // Act
    const decision = catalogueFor("default", rules);

    // Assert
    strictEqual(decision.tools.includes("http_api"), false);
    deepStrictEqual(decision.deniedByRule, ["http_api"]);
  });
});

describe("the tool lists", () => {
  it("list the write tools from the classes, each once", () => {
    // Arrange
    const expected = WRITE_TOOLS_IN_ORDER;

    // Act
    const tools = WRITE_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("derive the ruleable list from the classes", () => {
    // Arrange
    const expected = [...READ_TOOLS, ...NETWORK_READ_TOOLS, ...WRITE_TOOLS, ...ACT_TOOLS, ...SCRIPT_TOOLS.map((t) => t.name)];

    // Act
    const tools = RULEABLE_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("name each ruleable tool once", () => {
    // Arrange
    const tools = RULEABLE_TOOLS;

    // Act
    const distinct = new Set(tools).size;

    // Assert
    strictEqual(distinct, tools.length);
  });

  it("offer every ruleable tool but ACT_TOOLS and SCRIPT_TOOLS in some mode, and nothing else", () => {
    // Arrange
    const attached = (t: string) => ACT_TOOLS.includes(t) || scriptToolAccess(t) !== undefined;

    // Act
    const offered = new Set(PERMISSION_MODES.flatMap((mode) => toolsetFor(mode)));

    // Assert
    deepStrictEqual([...offered].sort(), RULEABLE_TOOLS.filter((t) => !attached(t)).sort());
  });

  it("declare the access of Orkeon Code's own tools: the validation reads, the test run and the build execute", () => {
    // Arrange
    const expected = SCRIPT_TOOLS_DECLARED;

    // Act
    const tools = SCRIPT_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  for (const c of SCRIPT_TOOL_ACCESS_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool } = c;

      // Act
      const access = scriptToolAccess(tool);

      // Assert
      strictEqual(access, c.access);
    });
  }

  for (const mode of PERMISSION_MODES) {
    it(`offer the shared memory's recall in ${mode} and its push only if the mode edits (M-5)`, () => {
      // Arrange
      const expected = isReadOnly(mode) ? ["memory_recall"] : ["memory_recall", "memory_push"];

      // Act
      const tools = scriptToolsFor(mode, MEMORY_TOOLS);

      // Assert
      deepStrictEqual(tools, expected, mode);
    });
  }

  for (const c of SCRIPT_TOOLS_FOR_CASES) {
    it(c.name, () => {
      // Arrange
      const { mode, tools, rules } = c;

      // Act
      const offered = scriptToolsFor(mode, tools, rules);

      // Assert
      deepStrictEqual(offered, c.expected);
    });
  }

  for (const mode of PERMISSION_MODES) {
    it(`offer the reads of Orkeon #180 in ${mode} and its edit tools only if the mode edits`, () => {
      // Arrange
      const edits = !isReadOnly(mode);

      // Act
      const t = toolsetFor(mode);

      // Assert
      assertOffered(t, ORKEON_180_READS, true, mode);
      assertOffered(t, ORKEON_180_EDITS, edits, mode);
    });
  }

  it("know the arguments orkeon.d.ts declares for every ruleable tool but spawn_agent and SCRIPT_TOOLS", () => {
    // Arrange
    const own = (tool: string) => tool === "spawn_agent" || scriptToolAccess(tool) !== undefined;

    // Act
    const declared = builtInToolInputs();

    // Assert
    assertArgumentsDeclared(TOOL_ARGUMENTS, declared, own);
  });

  it("find every ruleable tool but spawn_agent and SCRIPT_TOOLS declared in orkeon.d.ts", () => {
    // Arrange
    const own = (tool: string) => tool === "spawn_agent" || scriptToolAccess(tool) !== undefined;

    // Act
    const declared = builtInToolInputs();

    // Assert
    for (const tool of RULEABLE_TOOLS) if (!own(tool)) ok(declared.has(tool), tool);
  });

  it("know the arguments of every ruleable tool, and of no other", () => {
    // Arrange
    const expected = [...RULEABLE_TOOLS].sort();

    // Act
    const tools = Object.keys(TOOL_ARGUMENTS).sort();

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("name each argument of a tool once, in snake_case", () => {
    // Arrange
    const toolArguments = TOOL_ARGUMENTS;

    // Act
    const entries = Object.keys(toolArguments).length;

    // Assert
    ok(entries > 0);
    assertWellFormedArguments(toolArguments);
  });

  for (const c of TOOL_ARGUMENT_CASES) {
    it(`know the arguments ${c.tool} takes`, () => {
      // Arrange
      const { tool } = c;

      // Act
      const args = TOOL_ARGUMENTS[tool];

      // Assert
      deepStrictEqual(args, c.args);
    });
  }
});

describe("isReadOnly", () => {
  for (const c of READ_ONLY_CASES) {
    it(`${c.mode} is ${c.readOnly ? "" : "not "}read-only: plan and dontAsk are, the rest are not`, () => {
      // Arrange
      const { mode } = c;

      // Act
      const readOnly = isReadOnly(mode);

      // Assert
      strictEqual(readOnly, c.readOnly);
    });
  }
});

describe("permissionNote / buildActPrompt", () => {
  it("plan note forbids mutation and asks for an assessment or a plan", () => {
    // Arrange
    const mode = "plan";

    // Act
    const note = permissionNote(mode);

    // Assert
    assertMentions(note, ["MUST NOT modify", "an assessment or a plan"]);
  });

  it("dontAsk note forbids mutation", () => {
    // Arrange
    const mode = "dontAsk";

    // Act
    const note = permissionNote(mode);

    // Assert
    assertMentions(note, ["MUST NOT modify"]);
  });

  for (const mode of WRITING_MODES) {
    it(`${mode}'s note allows edits and shell, as every writing mode's, acceptEdits included`, () => {
      // Arrange
      const expected = writingNote(mode);

      // Act
      const note = permissionNote(mode);

      // Assert
      strictEqual(note, expected);
    });
  }

  for (const c of NOTE_NETWORK_CASES) {
    it(`the note of ${c.mode} tracks the network class it grants or withholds`, () => {
      // Arrange
      const { mode } = c;

      // Act
      const note = permissionNote(mode);

      // Assert
      assertMentions(note, [c.mention]);
    });
  }

  it("buildActPrompt appends the note after the prompt", () => {
    // Arrange
    const prompt = "do X";

    // Act
    const p = buildActPrompt(prompt, "plan");

    // Assert
    ok(p.startsWith("do X\n\n"), p);
    assertMentions(p, ["Permission mode: plan"]);
  });
});

// ── The session's rules: the gate enforces them, the catalogue drops whole-tool denies ──

describe("catalogueFor", () => {
  for (const mode of ALL_MODES) {
    it(`a whole-tool deny on file_write removes it from EVERY mode's catalogue: ${mode}`, () => {
      // Arrange
      const rules = [DENY_FILE_WRITE];

      // Act
      const d = catalogueFor(mode, rules);

      // Assert
      strictEqual(d.tools.includes("file_write"), false, mode);
    });
  }

  // A catalogue missing file_write because of `plan` and one missing it because
  // of a deny rule look identical from the tool list alone.
  it("reports which removals came from a rule, so /permissions can distinguish them", () => {
    // Arrange
    const rules = [DENY_FILE_WRITE];

    // Act
    const denied = catalogueFor("default", rules);

    // Assert
    deepStrictEqual(denied.deniedByRule, ["file_write"]);
  });

  it("reports no removal by rule where the mode withholds the tool", () => {
    // Arrange
    const rules: [] = [];

    // Act
    const byMode = catalogueFor("plan", rules);

    // Assert
    deepStrictEqual(byMode.deniedByRule, [], "plan withholds by mode, not by rule");
    strictEqual(byMode.tools.includes("file_write"), false);
  });

  it("deny wins in bypassPermissions too — tightening is never overridable", () => {
    // Arrange
    const rules = [{ effect: "deny" as const, tool: "shell_command" }];

    // Act
    const d = catalogueFor("bypassPermissions", rules);

    // Assert
    strictEqual(d.tools.includes("shell_command"), false);
  });

  it("deny on a tool the mode already withholds is a no-op, not a phantom removal", () => {
    // Arrange
    const rules = [{ effect: "deny" as const, tool: "shell_command" }];

    // Act
    const d = catalogueFor("plan", rules);

    // Assert
    deepStrictEqual(d.deniedByRule, [], "nothing was removed — plan never had it");
  });

  it("leaves the tool of an argument-scoped deny offered: the gate refuses the matching calls only", () => {
    // Arrange
    const rules = [GIT_PUSH];

    // Act
    const d = catalogueFor("acceptEdits", rules);

    // Assert
    deepStrictEqual(d.tools, toolsetFor("acceptEdits"));
    deepStrictEqual(d.deniedByRule, []);
  });

  for (const mode of ALL_MODES) {
    it(`never adds a tool for an allow rule in ${mode}: an allow spares a question, it hands nothing over`, () => {
      // Arrange
      const rules = [{ effect: "allow" as const, tool: "file_write" }, NPM_TEST];

      // Act
      const d = catalogueFor(mode, rules);

      // Assert
      deepStrictEqual(d.tools, toolsetFor(mode), mode);
    });
  }

  // `plan` and `dontAsk` being read-only BY CONSTRUCTION is what /commit's
  // refusal and the prompt note rest on: the catalogue keeps the promise, the
  // rule loses — loudly.
  it("reports an allow rule on a tool a read-only mode does not offer as inert, and says why", () => {
    // Arrange
    const rules = [{ effect: "allow" as const, tool: "file_write" }, NPM_TEST];

    // Act
    const d = catalogueFor("dontAsk", rules);

    // Assert
    deepStrictEqual(d.inert.map((r) => r.rule.tool), ["file_write", "shell_command"]);
    assertMentions(d.inert[0].reason, ["mode 'dontAsk' does not offer 'file_write'", "Switch mode"]);
  });

  it("reports EVERY allow rule as inert in plan, whose gate reads none, offered tool or not", () => {
    // Arrange
    const rules = PLAN_RULES;

    // Act
    const d = catalogueFor("plan", rules);

    // Assert
    deepStrictEqual(d.inert.map((r) => r.rule.tool), ["file_read", "file_write", "shell_command"]);
    assertInertReasons(d, "mode 'plan' ignores every allow rule");
  });

  for (const mode of PERMISSION_MODES) {
    it(`reports an allow rule on spawn_agent as inert in plan only, not in ${mode} unless it is plan: every act is offered it`, () => {
      // Arrange
      const allow = [{ effect: "allow" as const, tool: "spawn_agent" }];

      // Act
      const d = catalogueFor(mode, allow);

      // Assert
      deepStrictEqual(d.inert.map((r) => r.rule.tool), mode === "plan" ? ["spawn_agent"] : [], mode);
    });
  }

  it("reports no inert rule where the mode offers the tool and reads allow rules", () => {
    // Arrange
    const rules = [{ effect: "allow" as const, tool: "file_write" }, NPM_TEST];

    // Act
    const d = catalogueFor("default", rules);

    // Assert
    deepStrictEqual(d.inert, []);
  });

  it("reports no inert allow on a read tool in dontAsk, which offers it", () => {
    // Arrange
    const rules = [{ effect: "allow" as const, tool: "file_read" }];

    // Act
    const d = catalogueFor("dontAsk", rules);

    // Assert
    deepStrictEqual(d.inert, []);
  });

  for (const mode of ALL_MODES) {
    it(`no rules leaves the ${mode} catalogue byte-identical`, () => {
      // Arrange
      const rules: [] = [];

      // Act
      const d = catalogueFor(mode, rules);

      // Assert
      deepStrictEqual(d.tools, toolsetFor(mode), mode);
    });
  }
});

describe("rule grammar (readRule)", () => {
  for (const c of READ_RULE_CASES) {
    it(c.name, () => {
      // Arrange
      const { text } = c;

      // Act
      const rule = readRule(text);

      // Assert
      deepStrictEqual(rule, c.rule, String(text));
    });
  }

  for (const c of READ_PATTERN_CASES) {
    it(`takes one pair of matching quotes off the pattern, and only one: ${c.text}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const rule = readRule(text);

      // Assert
      deepStrictEqual(rule?.pattern, c.pattern);
    });
  }

  for (const c of FORMAT_CASES) {
    it(`formats a rule as the host gate lists it: ${c.text}`, () => {
      // Arrange
      const { rule } = c;

      // Act
      const text = formatRule(rule);

      // Assert
      strictEqual(text, c.text);
    });
  }

  for (const rule of ROUND_TRIP_RULES) {
    it(`formats the rule ${gateLine(rule)} as its gate line`, () => {
      // Arrange
      const expected = gateLine(rule);

      // Act
      const text = formatRule(rule);

      // Assert
      strictEqual(text, expected);
    });

    it(`reads the rule ${gateLine(rule)} back as formatted`, () => {
      // Arrange
      const text = formatRule(rule);

      // Act
      const read = readRule(text);

      // Assert
      deepStrictEqual(read, rule);
    });
  }

  for (const pattern of QUOTED_PATTERNS) {
    it(`quotes the pattern ${pattern}, which starts and ends with a quote, once more, so it reads back as written`, () => {
      // Arrange
      const rule = { effect: "deny" as const, tool: "shell_command", argument: "command", pattern };

      // Act
      const read = readRule(formatRule(rule));

      // Assert
      deepStrictEqual(read, rule, pattern);
    });
  }

  it("quotes a quoted pattern once more in the gate line", () => {
    // Arrange
    const rule = { ...GIT_PUSH, pattern: '"x"' };

    // Act
    const line = gateLine(rule);

    // Assert
    strictEqual(line, 'deny shell_command command="x"');
  });

  it("tells a rule that covers every call", () => {
    // Arrange
    const rule = DENY_FILE_WRITE;

    // Act
    const every = coversEveryCall(rule);

    // Assert
    strictEqual(every, true);
  });

  it("tells a scoped rule from one that covers every call", () => {
    // Arrange
    const rule = NPM_TEST;

    // Act
    const every = coversEveryCall(rule);

    // Assert
    strictEqual(every, false);
  });

  for (const c of SAME_CALLS_CASES) {
    it(`tells which rules cover the same calls: ${c.name}`, () => {
      // Arrange
      const { a, b } = c;

      // Act
      const same = sameCalls(a, b);

      // Assert
      strictEqual(same, c.same, c.name);
    });
  }
});

describe("stored rules (parseStoredRule)", () => {
  for (const c of PARSE_STORED_CASES) {
    it(c.name, () => {
      // Arrange
      const { raw, extras } = c;

      // Act
      const rule = parseStoredRule(raw, extras);

      // Assert
      deepStrictEqual(rule, c.rule, String(raw));
    });
  }

  for (const rule of ROUND_TRIP_RULES) {
    it(`reads the stored rule ${gateLine(rule)} on a known tool as formatted`, () => {
      // Arrange
      const raw = formatRule(rule);

      // Act
      const read = parseStoredRule(raw);

      // Assert
      deepStrictEqual(read, rule);
    });
  }
});

describe("rules to add (checkRule)", () => {
  for (const c of CHECK_RULE_CASES) {
    it(c.name, () => {
      // Arrange
      const { text, extras } = c;

      // Act
      const check = checkRule(text, extras);

      // Assert
      deepStrictEqual(check, c.check);
    });
  }

  for (const c of CHECK_RULE_OK_CASES) {
    it(c.name, () => {
      // Arrange
      const { text } = c;

      // Act
      const check = checkRule(text);

      // Assert
      strictEqual(check.ok, c.ok);
    });
  }

  it("accepts an argument of an extra tool, with a warning: its arguments are not known here", () => {
    // Arrange
    const extras = ["search_issues"];

    // Act
    const check = checkRule("deny search_issues query=secret*", extras);

    // Assert
    assertAcceptedWithWarning(
      check, { effect: "deny", tool: "search_issues", argument: "query", pattern: "secret*" },
      "the arguments of 'search_issues' are not known here", "named exactly 'query'",
    );
  });
});

describe("extra tools (tools.extra)", () => {
  for (const mode of [...READ_ONLY_MODES, ...WRITING_MODES]) {
    it(`offers a read extra tool in every mode, with the local reads: ${mode}`, () => {
      // Arrange
      const extras = [READER];

      // Act
      const t = toolsetFor(mode, extras);

      // Assert
      strictEqual(t.indexOf("transcribe_audio"), READ_TOOLS.length, mode);
    });
  }

  for (const mode of READ_ONLY_MODES) {
    it(`withholds a write extra tool from the read-only mode ${mode}`, () => {
      // Arrange
      const extras = [WRITER];

      // Act
      const t = toolsetFor(mode, extras);

      // Assert
      strictEqual(t.includes("search_issues"), false, mode);
    });
  }

  for (const mode of WRITING_MODES) {
    it(`offers a write extra tool in the writing mode ${mode}, after the built-in classes`, () => {
      // Arrange
      const expected = [...toolsetFor(mode), "search_issues"];

      // Act
      const t = toolsetFor(mode, [WRITER]);

      // Assert
      deepStrictEqual(t, expected, mode);
    });
  }

  it("removes an extra tool a deny covers whole, and calls an allow on a withheld one inert", () => {
    // Arrange
    const rules = EXTRA_RULES;

    // Act
    const plan = catalogueFor("plan", rules, [READER, WRITER]);

    // Assert
    deepStrictEqual(plan.deniedByRule, ["transcribe_audio"]);
    deepStrictEqual(plan.inert.map((r) => r.rule.tool), ["search_issues"]);
  });

  it("calls no allow on an offered extra tool inert", () => {
    // Arrange
    const rules = EXTRA_RULES;

    // Act
    const d = catalogueFor("default", rules, [READER, WRITER]);

    // Assert
    deepStrictEqual(d.inert, []);
  });

  for (const c of RULEABLE_TOOL_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool, extras } = c;

      // Act
      const spelled = ruleableTool(tool, extras);

      // Assert
      strictEqual(spelled, c.spelled);
    });
  }
});

describe("rag_ingest, an edit as the host gate classifies it (Orkeon #126)", () => {
  for (const mode of READ_ONLY_MODES) {
    it(`is withheld from the read-only mode ${mode}`, () => {
      // Arrange
      const tool = "rag_ingest";

      // Act
      const t = toolsetFor(mode);

      // Assert
      strictEqual(t.includes(tool), false, mode);
    });
  }

  for (const mode of WRITING_MODES) {
    it(`is offered with the edits in ${mode}`, () => {
      // Arrange
      const tool = "rag_ingest";

      // Act
      const t = toolsetFor(mode);

      // Assert
      ok(t.includes(tool), mode);
    });
  }

  it("is no read tool, unlike rag_search", () => {
    // Arrange
    const tools = READ_TOOLS;

    // Act
    const reads = { search: tools.includes("rag_search"), ingest: tools.includes("rag_ingest") };

    // Assert
    ok(reads.search && !reads.ingest);
  });
});

describe("shellWords and shellCommandForms", () => {
  for (const c of SHELL_WORDS_CASES) {
    it(`splits ${JSON.stringify(c.command)} as the host's shell tool does: whitespace outside quotes, the quotes dropped`, () => {
      // Arrange
      const { command } = c;

      // Act
      const words = shellWords(command);

      // Assert
      deepStrictEqual(words, c.words);
    });
  }

  for (const c of SHELL_FORMS_CASES) {
    it(`gives the raw command first, then the words rejoined, unescaped and with option clusters split, each once: ${c.command}`, () => {
      // Arrange
      const { command } = c;

      // Act
      const forms = shellCommandForms(command);

      // Assert
      deepStrictEqual(forms, c.forms);
    });
  }
});

describe("globMatches, matchesRule and ruleDecision", () => {
  for (const c of GLOB_CASES) {
    it(`${c.name}: ${JSON.stringify(c.pattern)} on ${JSON.stringify(c.text)}`, () => {
      // Arrange
      const { pattern, text } = c;

      // Act
      const matches = globMatches(pattern, text);

      // Assert
      strictEqual(matches, c.matches);
    });
  }

  for (const c of MATCHES_RULE_CASES) {
    it(c.name, () => {
      // Arrange
      const rule = readRule(c.rule)!;

      // Act
      const matches = matchesRule(rule, c.tool, c.args);

      // Assert
      strictEqual(matches, c.matches, JSON.stringify(c.args));
    });
  }

  for (const c of DECISION_CASES) {
    it(`${c.name}, and leaves the rest to the mode: ${c.command}`, () => {
      // Arrange
      const rules = GIT_RULE_TEXTS.map((text) => readRule(text)!);

      // Act
      const decision = ruleDecision(rules, "shell_command", { command: c.command });

      // Assert
      strictEqual(decision, c.decision);
    });
  }
});
