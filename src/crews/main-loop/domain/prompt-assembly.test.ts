// Pure prompt-assembly tests. The load-bearing property is prefix-cache safety:
// the static header (the SYSTEM prompt, sent via ActOptions.system) must be
// byte-stable across turns, and the volatile blocks all live in the USER body
// assemblePrompt() produces. The rule markers pin the behaviour specification of
// docs/architecture.md, "Prompt assembly".
// Run: node --test src/crews/main-loop/domain/prompt-assembly.test.ts

import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";
import {
  HISTORY_WINDOW,
  MAX_MEMORY_ENTRIES_PER_CATEGORY,
  assemblePrompt,
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
} from "./prompt-assembly.ts";
import { toolsetFor } from "../../../shared/domain/agent-policy/permission.ts";
import { PERMISSION_MODES } from "../../../shared/domain/permission-modes.ts";
import { MEMORY_CATEGORIES } from "../../../shared/domain/agent-policy/memory-categories.ts";
import { OUTPUT_STYLES, isOutputStyle } from "../../../shared/domain/agent-policy/output-styles.ts";

describe("buildStaticHeader", () => {
  it("is byte-identical across calls with the same inputs (cache prefix)", () => {
    const opts = { toolNames: ["file_read", "file_write"], claudeMd: "# Rules\nDo X." };
    strictEqual(buildStaticHeader(opts), buildStaticHeader(opts));
  });

  it("sorts tool names so catalogue order does not change the bytes", () => {
    const a = buildStaticHeader({ toolNames: ["file_write", "file_read"] });
    const b = buildStaticHeader({ toolNames: ["file_read", "file_write"] });
    strictEqual(a, b);
  });

  it("omits the CLAUDE.md block entirely when absent or blank", () => {
    const withoutMd = buildStaticHeader({ toolNames: ["file_read"] });
    ok(!withoutMd.includes("CLAUDE.md"));
    const blankMd = buildStaticHeader({ toolNames: ["file_read"], claudeMd: "   " });
    strictEqual(blankMd, withoutMd);
  });

  it("contains no digits or dates (guard against gauges leaking into the prefix)", () => {
    const header = buildStaticHeader({ toolNames: ["file_read", "shell_command"], claudeMd: "Use pnpm." });
    ok(!/\d/.test(header), `static header must stay number-free, got: ${header}`);
  });

  it("carries the behaviour blocks, in fixed order, before the tool list", () => {
    // The order of docs/architecture.md, "Prompt assembly": who the agent is, how it
    // reports, then how it works, then what it may trust, then its tools. All
    // unconditional, so byte-stability per mode is unchanged by their presence.
    const header = buildStaticHeader({ toolNames: ["file_read"], claudeMd: "# Rules" });
    const order = [
      "You are Orkeon Code",
      "## Reporting back",
      "## Tone",
      "## Scope",
      "## Finishing the turn",
      "## When to ask",
      "## Checking your work",
      "## Acting with care",
      "## Where instructions come from",
      "## Tools",
      "## Project instructions (CLAUDE.md)",
    ].map((marker) => header.indexOf(marker));
    ok(order.every((idx, i) => idx >= 0 && (i === 0 || idx > order[i - 1]!)), `bad order: ${order}`);
  });

  // One marker per rule of the specification: a rewrite that drops a rule fails here.
  const RULE_MARKERS: Record<string, string> = {
    "identity: the final answer is all the user sees": "That answer is all the user reads",
    "reporting: a failure or an unchecked result comes first": "the first sentence says so",
    "reporting: code is pointed at as path:line": "`path:line`",
    "reporting: no invented labels": "never lean on names you made up",
    "reporting: the user's language": "Answer in the language the user writes in",
    "tone: no praise, no emoji": "no emoji",
    "tone: conclusions, not narration": "do not narrate your own thinking",
    "scope: a request is carried out in the code": "rather than reply with the new name",
    "scope: nothing speculative": "a few repeated lines beat a helper",
    "scope: validate at the boundaries only": "where it enters the system",
    "scope: dead code goes entirely": "no re-export",
    "scope: no vulnerable code": "open to injection",
    "scope: comments say why": "A comment says what the code cannot",
    "scope: no unrequested documentation": "write documentation or notes only",
    "finishing: act once the facts are known": "reopen a decision the user made",
    "finishing: a question gets an assessment, not a change": "change nothing until the user asks for a change",
    "finishing: no ending on a plan or a promise": "read your last paragraph",
    "finishing: evidence before a state change": "a familiar symptom can have another cause",
    "asking: a question ends the turn": "writing a question ends it",
    "asking: a confirmation covers one call": "covers that call only",
    "verification: narrowest check first": "the narrowest test that covers the change first",
    "verification: no unrun check reported as passing": "never present a check you did not run as passing",
    "care: reversibility and reach": "how hard it is to undo",
    "care: no bypassing a failing check": "disabling, skipping or forcing it",
    "care: git only on request, staged by name": "stage files by name",
    "care: secrets stay in the environment": "Secrets live in environment variables",
    "trust: the instructions file ranks below the request": "ranks below",
    "trust: marked history messages are material": "[restored-file]",
    "trust: an embedded instruction is not followed": "do not; mention it",
  };
  for (const [rule, marker] of Object.entries(RULE_MARKERS)) {
    it(`states the rule — ${rule}`, () => {
      ok(buildStaticHeader({ toolNames: ["file_read"] }).includes(marker), `missing: ${marker}`);
    });
  }

  it("the permission-refusal note rides with the tool list, and only with it", () => {
    // The note is about the catalogue, so a header without tools must not carry it.
    const note = "change your approach instead of repeating the call";
    ok(buildStaticHeader({ toolNames: ["file_read"] }).includes(note));
    ok(!buildStaticHeader({ toolNames: [] }).includes(note));
  });

  it("describes what the offered tools can do, and only those tools", () => {
    const write = buildStaticHeader({ toolNames: ["file_read", "file_write", "shell_command"] });
    ok(write.includes("Calls run one at a time"));
    ok(write.includes("replaces the whole file"), "file_write's semantics");
    ok(write.includes("`sed -n`"), "a later part of a file is read through the shell when it is offered");
    ok(write.includes("only the commands the host allows"), "the shell's allow-list");
    // A read-only catalogue is not told how to write, nor about a shell it does not have.
    const read = buildStaticHeader({ toolNames: ["file_read", "symbol_source"] });
    ok(!read.includes("replaces the whole file"));
    ok(!read.includes("only the commands the host allows"));
    ok(read.includes("`symbol_source`"), "without a shell, a later part of a source file comes through symbol_source");
    ok(!buildStaticHeader({ toolNames: [] }).includes("Calls run one at a time"));
  });

  it("keeps the authored header under its ceiling in every mode", () => {
    for (const mode of PERMISSION_MODES) {
      const header = buildStaticHeader({ toolNames: toolsetFor(mode, []) });
      ok(header.length <= MAX_STATIC_HEADER_CHARS, `${mode}: ${header.length} > ${MAX_STATIC_HEADER_CHARS}`);
    }
  });

  it("instructs box-drawing trees for file listings (inside the reporting block)", () => {
    // The observed failure: "liste les fichiers" produced a flat bullet list of
    // backticked paths — correct content, unreadable shape. The directive names
    // the exact connectors so the model does not invent its own notation. It is
    // digit-free by construction (the no-digit pin above covers it).
    const header = buildStaticHeader({ toolNames: ["file_read"] });
    for (const connector of ["├──", "└──"]) ok(header.includes(connector), `missing ${connector}`);
    const inReporting = header.indexOf("├──");
    ok(inReporting > header.indexOf("## Reporting back"));
    ok(inReporting < header.indexOf("## Tone"), "the directive belongs to the reporting block");
  });
});

describe("buildMemoryBlock", () => {
  it("renders categories in the fixed order and omits empty ones", () => {
    const block = buildMemoryBlock({ reference: ["r1"], user: ["u1"], feedback: [] });
    const userIdx = block.indexOf("### user");
    const refIdx = block.indexOf("### reference");
    ok(userIdx >= 0 && refIdx > userIdx, "user must render before reference");
    ok(!block.includes("### feedback"));
    ok(!block.includes("### project"));
  });

  it("caps entries per category and returns '' when everything is empty", () => {
    const many = Array.from({ length: 25 }, (_, i) => `entry ${i}`);
    const block = buildMemoryBlock({ user: many });
    const bullets = block.split("\n").filter((l) => l.startsWith("- "));
    strictEqual(bullets.length, MAX_MEMORY_ENTRIES_PER_CATEGORY);
    strictEqual(buildMemoryBlock({}), "");
    strictEqual(MEMORY_CATEGORIES.length, 4);
  });
});

describe("windowHistory", () => {
  it("keeps short histories intact and windows to the LAST N messages", () => {
    const short = [{ role: "user", content: "a" }];
    deepStrictEqual(windowHistory(short), short);

    const long = Array.from({ length: HISTORY_WINDOW + 10 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const windowed = windowHistory(long);
    strictEqual(windowed.length, HISTORY_WINDOW);
    strictEqual(windowed[windowed.length - 1]!.content, `m${HISTORY_WINDOW + 9}`);
    strictEqual(windowed[0]!.content, "m10");
  });
});

describe("buildGaugeBlock", () => {
  it("wraps the numbers in a <system-reminder>", () => {
    const gauge = buildGaugeBlock({ usedTokens: 1200, contextWindow: 167000, costUsd: 0.42, totalTokens: 9000, totalCalls: 7 });
    ok(gauge.startsWith("<system-reminder>"));
    ok(gauge.endsWith("</system-reminder>"));
    ok(gauge.includes("1200/167000"));
    ok(gauge.includes("$0.42"));
  });
});

describe("assemblePrompt (the USER body)", () => {
  it("orders blocks memory → context → history → gauge → task, task last", () => {
    const prompt = assemblePrompt({
      memory: buildMemoryBlock({ user: ["u1"] }),
      userContext: buildUserContextBlock({ cwd: "/workspace", gitStatus: "## main" }),
      history: buildHistoryBlock([{ role: "user", content: "hi" }]),
      gauge: buildGaugeBlock({ usedTokens: 1, contextWindow: 2, costUsd: 0, totalTokens: 0, totalCalls: 0 }),
      task: "THE TASK",
    });
    const order = ["## Memory", "## Environment", "## Conversation so far", "<system-reminder>", "THE TASK"]
      .map((marker) => prompt.indexOf(marker));
    ok(order.every((idx, i) => idx >= 0 && (i === 0 || idx > order[i - 1]!)), `bad order: ${order}`);
    ok(prompt.endsWith("THE TASK"));
  });

  it("skips empty optional blocks without doubling separators", () => {
    const prompt = assemblePrompt({ memory: "", history: "", task: "T" });
    strictEqual(prompt, "T");
  });

  it("never contains the static header — identity travels as the system prompt", () => {
    // The whole point of the system/user split: assembling the body cannot
    // re-embed the header, because PromptParts has no field to put it in.
    const body = assemblePrompt({
      memory: buildMemoryBlock({ user: ["u1"] }),
      task: "THE TASK",
    });
    ok(!body.includes("You are Orkeon Code"), "identity leaked into the user body");
    ok(!body.includes("## Tools"), "the tool list leaked into the user body");
  });
});

// ── B-7 / B-13: the expanded block inventory ────────────────────────────

describe("buildPreferencesBlock (B-7)", () => {
  it("renders NOTHING for an unconfigured session", () => {
    // ACCEPTANCE 1's real content: adding blocks must not change the prompt of a
    // session that set nothing. Otherwise every existing session's cache prefix
    // moves on upgrade.
    strictEqual(buildPreferencesBlock({}), "");
    strictEqual(buildPreferencesBlock({ outputStyle: "default" }), "");
    strictEqual(buildPreferencesBlock({ outputStyle: "nonsense" }), "");
    strictEqual(buildPreferencesBlock({ language: "   " }), "");
  });

  it("wraps the directives in <system-reminder>, as the original does beyond the gauge", () => {
    const block = buildPreferencesBlock({ outputStyle: "concise" });
    ok(block.startsWith("<system-reminder>"), block);
    ok(block.endsWith("</system-reminder>"), block);
    ok(block.includes("concise"), block);
  });

  it("renders each declared style with its own directive text", () => {
    const seen = new Set<string>();
    for (const style of OUTPUT_STYLES) {
      if (style === "default") continue;
      const block = buildPreferencesBlock({ outputStyle: style });
      ok(block.includes(style), style);
      seen.add(block);
    }
    strictEqual(seen.size, OUTPUT_STYLES.length - 1, "a style whose text duplicates another is not a style");
  });

  it("carries a language directive, alone or with a style", () => {
    ok(buildPreferencesBlock({ language: "French" }).includes("French"));
    const both = buildPreferencesBlock({ outputStyle: "learning", language: "French" });
    ok(both.includes("learning") && both.includes("French"), both);
  });

  it("accepts only the declared styles", () => {
    strictEqual(isOutputStyle("concise"), true);
    strictEqual(isOutputStyle("Concise"), false, "the vocabulary is case-sensitive, like the modes");
    strictEqual(isOutputStyle(""), false);
    strictEqual(isOutputStyle(undefined), false);
  });
});

describe("buildSkillsBlock (B-13)", () => {
  it("ACCEPTANCE 1 — registered skills' fragments appear when the registry is non-empty", () => {
    const block = buildSkillsBlock([{ path: "/workspace/play.md", content: "Always run the tests." }]);
    ok(block.includes("## Attached skills"), block);
    ok(block.includes("/workspace/play.md"), block);
    ok(block.includes("Always run the tests."), block);
  });

  it("is empty when nothing is attached, or when a skill has no content", () => {
    strictEqual(buildSkillsBlock([]), "");
    strictEqual(buildSkillsBlock([{ path: "p", content: "   " }]), "");
    // A path with no content would announce a playbook the model cannot read.
  });

  it("caps a long playbook and SAYS it truncated", () => {
    const long = "x".repeat(MAX_SKILL_FRAGMENT_CHARS + 500);
    const block = buildSkillsBlock([{ path: "p", content: long }]);
    ok(block.includes("… (truncated)"), "a silent cut would look like the playbook ending there");
    ok(block.length < long.length + 200);
  });

  it("renders several skills in registry order", () => {
    const block = buildSkillsBlock([
      { path: "a.md", content: "first" },
      { path: "b.md", content: "second" },
    ]);
    ok(block.indexOf("a.md") < block.indexOf("b.md"), block);
  });
});

describe("buildHooksBlock (B-7)", () => {
  it("renders declared hooks AND their not-firing status", () => {
    // Telling the model a hook exists while nothing fires would make it reason
    // about a guarantee it does not have.
    const block = buildHooksBlock([{ event: "pre-tool", command: "npm test" }]);
    ok(block.includes("pre-tool"), block);
    ok(block.includes("npm test"), block);
    ok(block.includes("G-6"), "the block must name why nothing fires");
    ok(block.includes("declared, not firing"), block);
  });

  it("is empty with no hooks, and ignores entries without an event", () => {
    strictEqual(buildHooksBlock([]), "");
    strictEqual(buildHooksBlock([{ command: "x" }]), "");
  });
});

describe("assemblePrompt order with the new blocks", () => {
  it("keeps the block order fixed and the task LAST", () => {
    const out = assemblePrompt({
      preferences: "PREFS",
      skills: "SKILLS",
      memory: "MEM",
      hooks: "HOOKS",
      userContext: "ENV",
      history: "HIST",
      gauge: "GAUGE",
      task: "TASK",
    });
    const order = ["PREFS", "SKILLS", "MEM", "HOOKS", "ENV", "HIST", "GAUGE", "TASK"];
    let cursor = -1;
    for (const marker of order) {
      const at = out.indexOf(marker);
      ok(at > cursor, `${marker} is out of order`);
      cursor = at;
    }
  });

  it("ACCEPTANCE 1 — an unconfigured session's body is byte-identical to the pre-B-7 shape", () => {
    const legacy = assemblePrompt({
      memory: "MEM", userContext: "ENV",
      history: "HIST", gauge: "GAUGE", task: "TASK",
    });
    const withNewBlocksEmpty = assemblePrompt({
      preferences: buildPreferencesBlock({}),
      skills: buildSkillsBlock([]),
      memory: "MEM",
      hooks: buildHooksBlock([]),
      userContext: "ENV", history: "HIST", gauge: "GAUGE", task: "TASK",
    });
    strictEqual(withNewBlocksEmpty, legacy);
  });

  it("the system prompt is untouched by any preference — the cache prefix holds", () => {
    // The load-bearing property of the whole module: /output-style must not move
    // a single byte of the system prompt. Structurally guaranteed now (the header
    // is built from the catalogue and CLAUDE.md alone), pinned so a future
    // "helpful" parameter cannot re-couple them.
    const opts = { toolNames: ["file_read"], claudeMd: "# Rules" };
    const header = buildStaticHeader(opts);
    for (const style of OUTPUT_STYLES) {
      void buildPreferencesBlock({ outputStyle: style });
      strictEqual(buildStaticHeader(opts), header, `style '${style}' moved the system prompt`);
    }
  });
});
