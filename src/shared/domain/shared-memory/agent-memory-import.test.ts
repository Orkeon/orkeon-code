// The harness's MEMORY.md read as candidates (M-9): items, linked notes, the entry each becomes.
// Run: node --test src/shared/domain/shared-memory/agent-memory-import.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { importedEntry, parseAgentMemoryIndex, parseAgentNote, shortTitle } from "./agent-memory-import.ts";
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, entryProblems } from "./entry.ts";
import { IMPORTED_BODY_MENTIONS, INDEX, INDEX_ITEMS, NOTE_WITH_FRONT_MATTER, ctx } from "./agent-memory-import.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("parseAgentMemoryIndex", () => {
  it("reads one item per top-level list line, an indented line continuing it", () => {
    // Arrange
    const index = INDEX;

    // Act
    const items = parseAgentMemoryIndex(index);

    // Assert
    deepStrictEqual(items, INDEX_ITEMS);
  });

  it("skips a thematic break and strips emphasis from a title", () => {
    // Arrange
    const index = "* * *\n- **Bold:** text";

    // Act
    const items = parseAgentMemoryIndex(index);

    // Assert
    deepStrictEqual(items, [{ line: 2, title: "Bold: text", hook: "**Bold:** text" }]);
  });

  it("cuts a long title at a word", () => {
    // Arrange
    const text = "word ".repeat(40);

    // Act
    const title = shortTitle(text);

    // Assert
    ok(Array.from(title).length <= MAX_TITLE_CHARS, `a title of ${Array.from(title).length} characters`);
    ok(title.endsWith("word…"), title);
  });
});

describe("parseAgentNote", () => {
  it("drops the front matter and picks Why and How to apply", () => {
    // Arrange
    const text = NOTE_WITH_FRONT_MATTER;

    // Act
    const note = parseAgentNote(text);

    // Assert
    strictEqual(note.why, "saves a search.");
    strictEqual(note.howToApply, "check the case first.");
    ok(note.body.startsWith("Body line."), note.body);
  });

  it("keeps a bold word inside a sentence", () => {
    // Arrange
    const text = "**Why:** we must **never** skip it.";

    // Act
    const note = parseAgentNote(text);

    // Assert
    strictEqual(note.why, "we must **never** skip it.");
  });

  it("has neither when the note does not say them", () => {
    // Arrange
    const text = "just text";

    // Act
    const note = parseAgentNote(text);

    // Assert
    deepStrictEqual(note, { body: "just text" });
  });
});

describe("importedEntry", () => {
  it("makes a valid method candidate whose source is the import", () => {
    // Arrange
    const [item] = parseAgentMemoryIndex(INDEX);
    const note = parseAgentNote("## A heading\nText.\n\n**Why:** it saves time.\n");

    // Act
    const entry = importedEntry(item, note, ctx);

    // Assert
    deepStrictEqual(entryProblems(entry), []);
    strictEqual(entry.id, "shop-method-20261024-dev-learn-port-review");
    strictEqual(entry.status, "candidate");
    strictEqual(entry.source, "human:2026-10-24 import .claude/agent-memory/adversarial-reviewer/MEMORY.md");
    strictEqual(entry.rationale, "it saves time.");
    strictEqual(entry.appliesWhen, "L-3: parity held statically");
    deepStrictEqual(entry.tags, ["agent-memory", "adversarial-reviewer"]);
    assertMentions(entry.body, IMPORTED_BODY_MENTIONS);
    ok(!entry.body.includes("## A heading"), entry.body);
  });

  it("keeps a long free-text item valid", () => {
    // Arrange
    const [item] = parseAgentMemoryIndex(`- ${"lesson ".repeat(400)}`);

    // Act
    const entry = importedEntry(item, null, ctx);

    // Assert
    deepStrictEqual(entryProblems(entry), []);
  });

  it("keeps a long note within the body bound", () => {
    // Arrange
    const [item] = parseAgentMemoryIndex(INDEX);
    const note = parseAgentNote("x ".repeat(3000));

    // Act
    const entry = importedEntry(item, note, ctx);

    // Assert
    ok(entry.body.length <= MAX_BODY_CHARS, `a body of ${entry.body.length} characters`);
    deepStrictEqual(entryProblems(entry), []);
  });
});
