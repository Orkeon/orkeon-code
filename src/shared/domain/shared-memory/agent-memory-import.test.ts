// The harness's MEMORY.md read as candidates (M-9): items, linked notes, the entry each becomes.
// Run: node --test src/shared/domain/shared-memory/agent-memory-import.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { importedEntry, parseAgentMemoryIndex, parseAgentNote, shortTitle } from "./agent-memory-import.ts";
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, entryProblems } from "./entry.ts";

const INDEX = [
  "# Memory",
  "",
  "- [dev-learn port review](dev-learn-port-review.md) — L-3: parity held statically",
  "- Run the contract tests first when a suite exists",
  "  so a broken port fails fast",
  "* [outside](../other/x.md) - a link out of the folder",
  "```",
  "- not an item: fenced",
  "```",
  "prose, not an item",
  "-",
].join("\n");

describe("parseAgentMemoryIndex", () => {
  it("reads one item per top-level list line, an indented line continuing it", () => {
    deepStrictEqual(parseAgentMemoryIndex(INDEX), [
      { line: 3, title: "dev-learn port review", hook: "L-3: parity held statically", note: "dev-learn-port-review.md" },
      { line: 4, title: "Run the contract tests first when a suite exists so a broken port fails fast",
        hook: "Run the contract tests first when a suite exists so a broken port fails fast" },
      { line: 6, title: "outside", hook: "a link out of the folder" },
    ]);
  });

  it("skips a thematic break and strips emphasis from a title", () => {
    deepStrictEqual(parseAgentMemoryIndex("* * *\n- **Bold:** text"), [{ line: 2, title: "Bold: text", hook: "**Bold:** text" }]);
  });

  it("cuts a long title at a word", () => {
    const title = shortTitle("word ".repeat(40));
    ok(Array.from(title).length <= MAX_TITLE_CHARS);
    ok(title.endsWith("word…"));
  });
});

describe("parseAgentNote", () => {
  it("drops the front matter and picks Why and How to apply", () => {
    const note = parseAgentNote("---\nname: x\nmetadata:\n  type: project\n---\n\nBody line.\n\n**Why:** saves a search. **How to apply:** check the case first.\n");
    strictEqual(note.why, "saves a search.");
    strictEqual(note.howToApply, "check the case first.");
    ok(note.body.startsWith("Body line."));
  });

  it("keeps a bold word inside a sentence", () => {
    strictEqual(parseAgentNote("**Why:** we must **never** skip it.").why, "we must **never** skip it.");
  });

  it("has neither when the note does not say them", () => {
    deepStrictEqual(parseAgentNote("just text"), { body: "just text" });
  });
});

describe("importedEntry", () => {
  const ctx = { agent: "adversarial-reviewer", project: "shop", date: "2026-10-24" };

  it("makes a valid method candidate whose source is the import", () => {
    const [item] = parseAgentMemoryIndex(INDEX);
    const entry = importedEntry(item, parseAgentNote("## A heading\nText.\n\n**Why:** it saves time.\n"), ctx);
    deepStrictEqual(entryProblems(entry), []);
    strictEqual(entry.id, "shop-method-20261024-dev-learn-port-review");
    strictEqual(entry.status, "candidate");
    strictEqual(entry.source, "human:2026-10-24 import .claude/agent-memory/adversarial-reviewer/MEMORY.md");
    strictEqual(entry.rationale, "it saves time.");
    strictEqual(entry.appliesWhen, "L-3: parity held statically");
    deepStrictEqual(entry.tags, ["agent-memory", "adversarial-reviewer"]);
    ok(entry.body.includes("`.claude/agent-memory/adversarial-reviewer/MEMORY.md:3`"));
    ok(entry.body.includes("`.claude/agent-memory/adversarial-reviewer/dev-learn-port-review.md`"));
    ok(!entry.body.includes("## A heading"));
  });

  it("keeps a long free-text item valid", () => {
    const [item] = parseAgentMemoryIndex(`- ${"lesson ".repeat(400)}`);
    deepStrictEqual(entryProblems(importedEntry(item, null, ctx)), []);
  });

  it("keeps a long note within the body bound", () => {
    const [item] = parseAgentMemoryIndex(INDEX);
    const entry = importedEntry(item, parseAgentNote("x ".repeat(3000)), ctx);
    ok(entry.body.length <= MAX_BODY_CHARS);
    deepStrictEqual(entryProblems(entry), []);
  });
});
