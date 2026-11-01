// Pure prompt-assembly tests. The load-bearing property is prefix-cache safety:
// the static header (the SYSTEM prompt, sent via ActOptions.system) must be
// byte-stable across turns, and the volatile blocks all live in the USER body
// assembleContext() produces. The rule markers pin the behaviour specification of
// docs/architecture.md, "Prompt assembly".
// Run: node --test tests/crews/main-loop/domain/prompt-assembly.test.ts

import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  HISTORY_WINDOW,
  MAX_MEMORY_ENTRIES_PER_CATEGORY,
  assembleContext,
  buildGaugeBlock,
  buildHistoryBlock,
  buildMemoryBlock,
  buildStaticHeader,
  buildUserContextBlock,
  windowHistory,
  MAX_SKILL_FRAGMENT_CHARS,
  buildPreferencesBlock,
  buildSkillsBlock,
  buildHooksBlock,
  MAX_STATIC_HEADER_CHARS,
  withoutCurrentRequest,
} from "../../../../src/crews/main-loop/domain/prompt-assembly.ts";
import { MEMORY_TOOLS, scriptToolsFor, toolsetFor } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { PERMISSION_MODES } from "../../../../src/shared/domain/permission-modes.ts";
import { MEMORY_CATEGORIES } from "../../../../src/shared/domain/agent-policy/memory-categories.ts";
import { OUTPUT_STYLES, isOutputStyle } from "../../../../src/shared/domain/agent-policy/output-styles.ts";
import {
  AGENTS_HEADER_OPTS, BEHAVIOUR_BLOCKS_IN_ORDER, BODY_BLOCKS_IN_ORDER, CLAUDE_HEADER_OPTS, EMPTY_HOOKS_CASES,
  EMPTY_SKILLS_CASES, GAUGE_TIER_CASES, HOOK_STEPS, INSTRUCTIONS_FILE_CASES, KEPT_BUFFER_CASES, LEGACY_PARTS,
  MARKED_PARTS, MARKED_PARTS_IN_ORDER, OUTPUT_STYLE_CASES, REFUSAL_NOTE, REFUSAL_SCOPE, REPEATED_REQUEST_HISTORY, RULE_MARKERS,
  LESSONS_TOOL_RULE, COMPACTED_IN_HISTORY_RULE,
  MARKED_WINDOW_CASES, UNCONFIGURED_PREFERENCES_CASES, LESSONS_TOOLS, builtParts, toolTurns, userMessages,
} from "./prompt-assembly.fixtures.ts";
import {
  assertInOrder, assertLacks, assertMentions, assertSaysInsteadOf, assertSectionLacks, assertSystemReminder,
} from "./prompt-assembly.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("buildStaticHeader", () => {
  it("is byte-identical across calls with the same inputs (cache prefix)", () => {
    // Arrange
    const first = buildStaticHeader(AGENTS_HEADER_OPTS);

    // Act
    const second = buildStaticHeader(AGENTS_HEADER_OPTS);

    // Assert
    strictEqual(second, first);
  });

  it("sorts tool names so catalogue order does not change the bytes", () => {
    // Arrange
    const sorted = buildStaticHeader({ toolNames: ["file_read", "file_write"] });

    // Act
    const unsorted = buildStaticHeader({ toolNames: ["file_write", "file_read"] });

    // Assert
    strictEqual(unsorted, sorted);
  });

  it("omits the instructions block entirely when absent", () => {
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(!header.includes("## Project instructions"), header);
  });

  it("omits the instructions block entirely when blank", () => {
    // Arrange
    const without = buildStaticHeader({ toolNames: ["file_read"] });

    // Act
    const blank = buildStaticHeader({ toolNames: ["file_read"], instructions: { file: "AGENTS.md", content: "   " } });

    // Assert
    strictEqual(blank, without);
  });

  for (const c of INSTRUCTIONS_FILE_CASES) {
    it(`names the instructions file it carries — ${c.name}`, () => {
      // Arrange
      const opts = { toolNames: ["file_read"], instructions: { file: c.file, content: "Use pnpm." } };

      // Act
      const header = buildStaticHeader(opts);

      // Assert
      ok(header.includes(c.heading), header);
    });
  }

  it("contains no digits or dates (guard against gauges leaking into the prefix)", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "shell_command"], instructions: { file: "AGENTS.md", content: "Use pnpm." } };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(!/\d/.test(header), `static header must stay number-free, got: ${header}`);
  });

  it("carries the behaviour blocks, in fixed order, before the tool list", () => {
    // Arrange
    const opts = CLAUDE_HEADER_OPTS;

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertInOrder(header, BEHAVIOUR_BLOCKS_IN_ORDER);
  });

  for (const [rule, marker] of Object.entries(RULE_MARKERS)) {
    it(`states the rule — ${rule}`, () => {
      // Arrange
      const opts = { toolNames: ["file_read"] };

      // Act
      const header = buildStaticHeader(opts);

      // Assert
      ok(header.includes(marker), `missing: ${marker}`);
    });
  }

  it("the permission-refusal note rides with the tool list", () => {
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(header.includes(REFUSAL_NOTE), header);
  });

  it("reads a tool not offered as the mode's decision, never a script tool the list leaves out", () => {
    // Arrange
    const opts = { toolNames: ["file_read"], scriptTools: LESSONS_TOOLS };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertSaysInsteadOf(header, REFUSAL_SCOPE.says, REFUSAL_SCOPE.never, "the header");
  });

  it("the permission-refusal note is left out of a header without tools", () => {
    // Arrange
    const opts = { toolNames: [] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(!header.includes(REFUSAL_NOTE), header);
  });

  it("states that a catalogue that writes may change the project, destructive actions proposed, not performed", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "file_write"] };

    // Act
    const write = buildStaticHeader(opts);

    // Assert
    assertMentions(write, ["You may change the project", "goes into your answer as a proposal"], "the writing header");
  });

  it("states that a read-only catalogue delivers a plan and changes nothing", () => {
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const read = buildStaticHeader(opts);

    // Assert
    assertMentions(read, ["Read-only: read and search, change nothing", "a plan the user can approve"], "the read-only header");
    assertLacks(read, ["You may change the project"], "the read-only header");
  });

  it("puts the project before the web where a web tool is offered", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "web_scrape"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, [
      "The web tools come after the project's docs and example settings",
      "wins over the web's",
      "a value read nowhere is no fact",
    ], "the header with web tools");
  });

  it("says nothing of the web where no web tool is offered", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "shell_command"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertLacks(header, ["The web tools come after"], "the header without web tools");
  });

  it("never lets a cut read feed a whole-file write", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "file_write"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(header.includes("Never rewrite a file whose read came back cut"), header);
  });

  it("describes what the offered writing tools and shell can do", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "file_write", "shell_command"] };

    // Act
    const write = buildStaticHeader(opts);

    // Assert
    ok(write.includes("A long result is cut before you see it"), write);
    ok(write.includes("replaces the whole file"), "file_write's semantics");
    ok(write.includes("with `offset` and `limit`"), "a later part of a file is read by file_read itself");
    ok(write.includes("only the commands the host allows"), "the shell's allow-list");
  });

  it("tells the model to read a file by range, since every call pays the context again", () => {
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(header.includes("read by range, a hundred lines or so"), header);
  });

  it("does not tell a read-only catalogue how to write, nor about a shell it does not have", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "symbol_source"] };

    // Act
    const read = buildStaticHeader(opts);

    // Assert
    ok(!read.includes("replaces the whole file"), read);
    ok(!read.includes("only the commands the host allows"), read);
    ok(read.includes("with `offset` and `limit`"), "the read-only modes read a later part the same way");
  });

  it("sends a change to an existing file through edit_file, by the smallest unique old_string", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "edit_file", "file_write"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["`edit_file` changes an existing file", "smallest `old_string` that is unique", "`replace_all`"]);
  });

  it("keeps file_write for a new file or a whole rewrite, without a whole-file read first", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "edit_file", "file_write"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["for a new file or a content rewritten whole"]);
    assertLacks(header, ["read the whole file first"]);
  });

  it("does not tell a read-only catalogue how to edit", () => {
    // Arrange
    const opts = { toolNames: ["file_read", "symbol_source"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertLacks(header, ["`edit_file`"]);
  });

  it("asks for the independent reads and searches of a turn in one message", () => {
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["do not depend on each other go out together, in one message", "waits for it"]);
  });

  it("keeps the shell for builds, tests, git and scripts, never for what the read tools do", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read", "shell_command"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["The shell is for builds, tests, git and the project's scripts", "`cat`, `ls`, `find`, `sed`", "which the tools do"]);
  });

  it("finds a file no index covers with glob where the shell is not offered", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read", "glob"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["find the file with `glob` and read it"]);
  });

  it("tells a read-only catalogue nothing about ingesting documents", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read", "rag_search"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertLacks(header, ["rag_ingest"]);
  });

  it("tells a read-only catalogue that an empty document search proves no absence", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read", "rag_search"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["an empty answer there is no proof of absence"]);
  });

  it("tells a writing catalogue to ingest again after editing a document", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read", "rag_search", "rag_ingest"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["re-run `rag_ingest` after editing a document"]);
  });

  it("names code files without listing their extensions nor the match origin of a hit", () => {
    // Arrange
    const opts = { toolNames: ["codebase_search", "file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertLacks(header, [".tsx", "match_origin"]);
  });

  it("describes no tool result to a header without tools", () => {
    // Arrange
    const opts = { toolNames: [] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    ok(!header.includes("A long result is cut before you see it"), header);
  });

  it("names memory_push as the shared lesson's tool, not the place of a fact to remember, when the session offers it", () => {
    // Arrange
    const opts = { toolNames: ["file_read"], scriptTools: LESSONS_TOOLS };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, [LESSONS_TOOL_RULE], "the header");
  });

  it("does not name memory_push in the remembering rule when the session does not offer it", () => {
    // Arrange
    const opts = { toolNames: ["file_read"], scriptTools: ["memory_recall"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertSectionLacks(header, "## Where instructions come from", ["memory_push"]);
  });

  for (const mode of PERMISSION_MODES) {
    it(`keeps the authored header under its ceiling in the ${mode} mode`, () => {
      // Arrange
      const opts = { toolNames: toolsetFor(mode, []), scriptTools: scriptToolsFor(mode, MEMORY_TOOLS) };

      // Act
      const header = buildStaticHeader(opts);

      // Assert
      ok(header.length <= MAX_STATIC_HEADER_CHARS, `${mode}: ${header.length} > ${MAX_STATIC_HEADER_CHARS}`);
    });
  }

  it("instructs box-drawing trees for file listings (inside the reporting block)", () => {
    // The observed failure: "liste les fichiers" produced a flat bullet list of
    // backticked paths — correct content, unreadable shape. The directive names
    // the exact connectors so the model does not invent its own notation. It is
    // digit-free by construction (the no-digit pin above covers it).
    // Arrange
    const opts = { toolNames: ["file_read"] };

    // Act
    const header = buildStaticHeader(opts);

    // Assert
    assertMentions(header, ["├──", "└──"], "the header");
    assertInOrder(header, ["## Reporting back", "├──", "## Tone"]);
  });
});

describe("buildMemoryBlock", () => {
  it("renders categories in the fixed order and omits empty ones", () => {
    // Arrange
    const notes = { reference: ["r1"], user: ["u1"], feedback: [] };

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    assertInOrder(block, ["### user", "### reference"]);
    assertLacks(block, ["### feedback", "### project"], "the memory block");
  });

  it("caps entries per category", () => {
    // Arrange
    const many = Array.from({ length: 25 }, (_, i) => `entry ${i}`);

    // Act
    const block = buildMemoryBlock({ user: many });

    // Assert
    strictEqual(block.split("\n").filter((l) => l.startsWith("- ")).length, MAX_MEMORY_ENTRIES_PER_CATEGORY);
  });

  it("returns '' when everything is empty", () => {
    // Arrange
    const notes = {};

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    strictEqual(block, "");
  });

  it("renders four memory categories", () => {
    // Arrange
    const categories = MEMORY_CATEGORIES;

    // Act
    const count = categories.length;

    // Assert
    strictEqual(count, 4);
  });
});

describe("windowHistory", () => {
  it("keeps short histories intact", () => {
    // Arrange
    const short = [{ role: "user", content: "a" }];

    // Act
    const windowed = windowHistory(short);

    // Assert
    deepStrictEqual(windowed, short);
  });

  it("windows a long history to the LAST N messages", () => {
    // Arrange
    const long = userMessages(HISTORY_WINDOW + 10);

    // Act
    const windowed = windowHistory(long);

    // Assert
    strictEqual(windowed.length, HISTORY_WINDOW);
    strictEqual(windowed[windowed.length - 1]!.content, `m${HISTORY_WINDOW + 9}`);
    strictEqual(windowed[0]!.content, "m10");
  });

  it("counts only the requests and the answers, the [tools] messages between them kept", () => {
    // Arrange
    const turns = toolTurns(HISTORY_WINDOW / 2 + 5);

    // Act
    const windowed = windowHistory(turns);

    // Assert
    deepStrictEqual(windowed, turns.slice(15));
  });

  for (const c of MARKED_WINDOW_CASES) {
    it(c.name, () => {
      // Arrange
      const { messages, max } = c;

      // Act
      const windowed = windowHistory(messages, max);

      // Assert
      deepStrictEqual(windowed, c.expected);
    });
  }
});

describe("buildHistoryBlock", () => {
  it("has a question about an earlier answer answered from its [tools] message", () => {
    // Arrange
    const messages = [{ role: "system", content: "[tools] The tool calls of the answer below:\n- grep(path=src) → ok" }];

    // Act
    const block = buildHistoryBlock(messages);

    // Assert
    assertMentions(block, ["A [tools] message before an answer names the calls that produced it", "never a guess"],
      "the history block");
  });

  it("reads a [compacted] message as a summary or as a note of turns removed without one, its gap reported", () => {
    // Arrange
    const messages = [{ role: "system", content: "[compacted] Earlier turns were removed." }];

    // Act
    const block = buildHistoryBlock(messages);

    // Assert
    assertMentions(block, COMPACTED_IN_HISTORY_RULE, "the history block");
  });
});

describe("buildGaugeBlock", () => {
  it("wraps the numbers in a <system-reminder>", () => {
    // Arrange
    const gauge = { usedTokens: 1200, contextWindow: 167000, costUsd: 0.42, totalTokens: 9000, totalCalls: 7 };

    // Act
    const block = buildGaugeBlock(gauge);

    // Assert
    assertSystemReminder(block);
    assertMentions(block, ["1200/167000", "$0.42"], "the gauge");
  });

  for (const c of GAUGE_TIER_CASES) {
    it(`adds the conduct of the pressure tier — ${c.name}`, () => {
      // Arrange
      const gauge = { usedTokens: c.usedTokens, contextWindow: 200_000, costUsd: 0, totalTokens: 0, totalCalls: 0 };

      // Act
      const block = buildGaugeBlock(gauge);

      // Assert
      strictEqual(block.includes(c.text), c.present, `${c.name}: ${block}`);
    });
  }
});

describe("buildMemoryBlock usage line", () => {
  it("introduces the notes as possibly stale", () => {
    // Arrange
    const notes = { user: ["u1"] };

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    ok(block.includes("possibly out of date"), block);
  });

  it("introduces the notes as saved at a compaction or with /memory add", () => {
    // Arrange
    const notes = { user: ["u1"] };

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    assertMentions(block, ["saved earlier (at a compaction or with /memory add)"], "the memory block");
  });

  it("promises no notes from earlier sessions", () => {
    // Arrange
    const notes = { user: ["u1"] };

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    assertLacks(block, ["earlier sessions"], "the memory block");
  });

  it("introduces nothing when there are no notes", () => {
    // Arrange
    const notes = {};

    // Act
    const block = buildMemoryBlock(notes);

    // Assert
    strictEqual(block, "");
  });
});

describe("buildUserContextBlock", () => {
  it("states the date and dates the git status to the start of the turn", () => {
    // Arrange
    const context = { cwd: WORKSPACE, date: "2026-10-17", gitStatus: "## main\n M a.ts\n" };

    // Act
    const block = buildUserContextBlock(context);

    // Assert
    assertMentions(block, ["date: 2026-10-17", "git status when this turn began:\n## main"], "the environment block");
  });

  it("states the cwd alone when it knows no date nor git status", () => {
    // Arrange
    const context = { cwd: WORKSPACE };

    // Act
    const block = buildUserContextBlock(context);

    // Assert
    strictEqual(block, `## Environment\ncwd: ${WORKSPACE}`);
  });
});

describe("withoutCurrentRequest", () => {
  it("drops the trailing entry when it is the request being answered", () => {
    // Arrange
    const history = [...REPEATED_REQUEST_HISTORY];

    // Act
    const kept = withoutCurrentRequest(history, " fix it ");

    // Assert
    deepStrictEqual(kept, REPEATED_REQUEST_HISTORY.slice(0, 2));
  });

  for (const c of KEPT_BUFFER_CASES) {
    it(`keeps the buffer when its last entry is something else — ${c.name}`, () => {
      // Arrange
      const expected = [...c.history];

      // Act
      const kept = withoutCurrentRequest(c.history, c.request);

      // Assert
      deepStrictEqual(kept, expected);
    });
  }
});

describe("assembleContext (the user message before the request)", () => {
  it("orders blocks memory → history → environment → gauge", () => {
    // Arrange
    const parts = builtParts();

    // Act
    const context = assembleContext(parts);

    // Assert
    assertInOrder(context, BODY_BLOCKS_IN_ORDER);
  });

  it("skips empty optional blocks without doubling separators", () => {
    // Arrange
    const parts = { memory: "", history: "", gauge: "G" };

    // Act
    const context = assembleContext(parts);

    // Assert
    strictEqual(context, "G");
  });

  it("renders nothing for a session that sets nothing", () => {
    // Arrange
    const parts = { memory: "", history: "" };

    // Act
    const context = assembleContext(parts);

    // Assert
    strictEqual(context, "");
  });

  it("never contains the static header — identity travels as the system prompt", () => {
    // The whole point of the system/context split: assembling the context cannot
    // re-embed the header, because ContextParts has no field to put it in.
    // Arrange
    const parts = { memory: buildMemoryBlock({ user: ["u1"] }) };

    // Act
    const body = assembleContext(parts);

    // Assert
    ok(!body.includes("You are Orkeon Code"), "identity leaked into the user body");
    ok(!body.includes("## Tools"), "the tool list leaked into the user body");
  });
});

// ── Preferences, skills and hooks ───────────────────────────────────────

describe("buildPreferencesBlock", () => {
  // ACCEPTANCE 1's real content: adding blocks must not change the prompt of a
  // session that set nothing. Otherwise every existing session's cache prefix
  // moves on upgrade.
  for (const c of UNCONFIGURED_PREFERENCES_CASES) {
    it(`renders NOTHING for an unconfigured session — ${c.name}`, () => {
      // Arrange
      const preferences = c.preferences;

      // Act
      const block = buildPreferencesBlock(preferences);

      // Assert
      strictEqual(block, "");
    });
  }

  it("wraps the directives in <system-reminder>, as the original does beyond the gauge", () => {
    // Arrange
    const preferences = { outputStyle: "concise" };

    // Act
    const block = buildPreferencesBlock(preferences);

    // Assert
    assertSystemReminder(block);
    ok(block.includes("concise"), block);
  });

  for (const style of OUTPUT_STYLES.filter((s) => s !== "default")) {
    it(`renders the declared style ${style} by its name`, () => {
      // Arrange
      const preferences = { outputStyle: style };

      // Act
      const block = buildPreferencesBlock(preferences);

      // Assert
      ok(block.includes(style), style);
    });
  }

  it("renders each declared style with its own directive text", () => {
    // Arrange
    const styles = OUTPUT_STYLES.filter((s) => s !== "default");

    // Act
    const blocks = styles.map((style) => buildPreferencesBlock({ outputStyle: style }));

    // Assert
    strictEqual(new Set(blocks).size, OUTPUT_STYLES.length - 1, "a style whose text duplicates another is not a style");
  });

  it("carries a language directive alone", () => {
    // Arrange
    const preferences = { language: "French" };

    // Act
    const block = buildPreferencesBlock(preferences);

    // Assert
    ok(block.includes("French"), block);
  });

  it("carries a language directive with a style", () => {
    // Arrange
    const preferences = { outputStyle: "learning", language: "French" };

    // Act
    const both = buildPreferencesBlock(preferences);

    // Assert
    assertMentions(both, ["learning", "French"], "the preferences block");
  });

  for (const c of OUTPUT_STYLE_CASES) {
    it(`accepts only the declared styles — ${c.name}`, () => {
      // Arrange
      const token = c.token;

      // Act
      const accepted = isOutputStyle(token);

      // Assert
      strictEqual(accepted, c.expected);
    });
  }
});

describe("buildSkillsBlock", () => {
  it("renders the attached skills' fragments when the registry is non-empty", () => {
    // Arrange
    const skills = [{ path: `${WORKSPACE}/play.md`, content: "Always run the tests." }];

    // Act
    const block = buildSkillsBlock(skills);

    // Assert
    assertMentions(block, ["## Attached skills", `${WORKSPACE}/play.md`, "Always run the tests."], "the skills block");
  });

  for (const c of EMPTY_SKILLS_CASES) {
    it(`is empty when ${c.name}`, () => {
      // Arrange
      const skills = c.skills;

      // Act
      const block = buildSkillsBlock(skills);

      // Assert
      strictEqual(block, "");
    });
  }

  it("caps a long playbook and SAYS it truncated", () => {
    // Arrange
    const long = "x".repeat(MAX_SKILL_FRAGMENT_CHARS + 500);

    // Act
    const block = buildSkillsBlock([{ path: "p", content: long }]);

    // Assert
    ok(block.includes("… (truncated)"), "a silent cut would look like the playbook ending there");
    ok(block.length < long.length + 200, `the block takes ${block.length} characters`);
  });

  it("renders several skills in registry order", () => {
    // Arrange
    const skills = [
      { path: "a.md", content: "first" },
      { path: "b.md", content: "second" },
    ];

    // Act
    const block = buildSkillsBlock(skills);

    // Assert
    assertInOrder(block, ["a.md", "b.md"]);
  });
});

describe("buildHooksBlock", () => {
  it("renders declared hooks AND their not-firing status", () => {
    // Telling the model a hook exists while nothing fires would make it reason
    // about a guarantee it does not have.
    // Arrange
    const hooks = [{ event: "pre-tool", command: "npm test" }];

    // Act
    const block = buildHooksBlock(hooks);

    // Assert
    assertMentions(block, ["pre-tool", "npm test"], "the hooks block");
    ok(block.includes("nothing runs them yet"), "the block must say that nothing fires");
    assertMentions(block, HOOK_STEPS, "the dev steps that run them, in the hooks block");
    ok(!/\b[A-Z]-\d/.test(block), "no ticket code: the model cannot use one");
  });

  for (const c of EMPTY_HOOKS_CASES) {
    it(c.name, () => {
      // Arrange
      const hooks = c.hooks;

      // Act
      const block = buildHooksBlock(hooks);

      // Assert
      strictEqual(block, "");
    });
  }
});

describe("assembleContext order with the new blocks", () => {
  it("keeps the block order fixed, the gauge last", () => {
    // Arrange
    const parts = MARKED_PARTS;

    // Act
    const out = assembleContext(parts);

    // Assert
    assertInOrder(out, MARKED_PARTS_IN_ORDER);
  });

  it("an unconfigured session renders none of the optional blocks", () => {
    // Arrange
    const legacy = assembleContext(LEGACY_PARTS);
    const parts = {
      ...LEGACY_PARTS,
      preferences: buildPreferencesBlock({}),
      skills: buildSkillsBlock([]),
      hooks: buildHooksBlock([]),
    };

    // Act
    const withNewBlocksEmpty = assembleContext(parts);

    // Assert
    strictEqual(withNewBlocksEmpty, legacy);
  });

  // The load-bearing property of the whole module: /output-style must not move
  // a single byte of the system prompt. Structurally guaranteed now (the header
  // is built from the catalogue and the instructions file alone), pinned so a future
  // "helpful" parameter cannot re-couple them.
  for (const style of OUTPUT_STYLES) {
    it(`the system prompt is untouched by the preference ${style} — the cache prefix holds`, () => {
      // Arrange
      const header = buildStaticHeader(CLAUDE_HEADER_OPTS);

      // Act
      void buildPreferencesBlock({ outputStyle: style });
      const after = buildStaticHeader(CLAUDE_HEADER_OPTS);

      // Assert
      strictEqual(after, header, `style '${style}' moved the system prompt`);
    });
  }
});
