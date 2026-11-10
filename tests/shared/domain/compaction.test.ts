// Moved from crews/session-compact/domain/ (F3.2) + new memory-extraction cases.
// Run: node --test tests/shared/domain/compaction.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  MIN_COMPACTABLE, buildCompactBoundaryMessage, buildCompactedBuffer, buildMemoryExtractionPrompt,
  buildMemoryRecapMessage, buildSnipNoticeMessage, buildRestoredFileMessage, buildSummaryPrompt, buildTranscript,
  countCompactBoundaries, extractRecentFilePaths, isCompactBoundary, sanitizeExtractedMemories,
  buildRestoredSkillMessage, buildRestoredStateMessage, clipTranscript, extractSummary, SUMMARY_MAX_WORDS,
  buildRestoredFileNotice, MEMORY_EXTRACTION_SCHEMA,
} from "../../../src/shared/domain/compaction.ts";
import {
  COMPACT_BOUNDARY_MARKER, SUMMARY_OPEN, SUMMARY_CLOSE, COMPACTED_HEADER,
} from "../../../src/shared/domain/markers.ts";
import { TRANSCRIPT_CAP_CHARS } from "../../../src/shared/domain/compaction-thresholds.ts";
import { MAX_EXTRACTED_MEMORIES } from "../../../src/shared/domain/compaction-thresholds.ts";
import {
  EXTRACTION_WITH_REPLACES, KNOWN_WITH_IDS, REPLACES_KEPT,
  BOUNDARY_CASES, BUFFER_WITH_TWO_BOUNDARIES, EXTRACTION_WITH_INVALID, HEAD_MIDDLE_TAIL, MALFORMED_ROOTS,
  MEMORY_CATEGORIES, SUMMARY_PARTS, SUMMARY_REPLIES, TURNS_NAMING_FILES, TWENTY_FACTS, TWO_MEMORIES,
  URL_WORDS_THEN_PATHS, SUMMARY_RETURNS, SUMMARY_PERMISSION, SUMMARY_EARLIER, SUMMARY_SNIP_NOTE, SUMMARY_UNKNOWN, TODAY,
  MEMORY_RECAP_HEADING, SNIP_NOTICE_PARTS,
} from "./compaction.fixtures.ts";
import { assertMarkedSystemMessage } from "./compaction.assertions.ts";
import { assertBefore, assertMentions, assertOmits } from "../../support/assertions/text.ts";
import { isMarkedMessage } from "../../../src/shared/domain/marked-message.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("buildTranscript", () => {
  it("renders role: content lines", () => {
    // Arrange
    const messages = [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }];

    // Act
    const transcript = buildTranscript(messages);

    // Assert
    strictEqual(transcript, "user: hi\nassistant: yo");
  });
});

describe("clipTranscript", () => {
  it("leaves a short transcript untouched", () => {
    // Arrange
    const text = "abc";

    // Act
    const clipped = clipTranscript(text, 10);

    // Assert
    strictEqual(clipped, "abc");
  });

  it("keeps a quarter at the head and the rest at the tail, and says how much it left out", () => {
    // Arrange
    const text = HEAD_MIDDLE_TAIL;

    // Act
    const clipped = clipTranscript(text, 400);

    // Assert
    ok(clipped.startsWith("H".repeat(100)), "the task as first stated");
    ok(clipped.endsWith("T".repeat(300)), "the current work");
    ok(clipped.includes("[… 800 characters of the middle of the conversation left out …]"), clipped);
  });
});

describe("buildSummaryPrompt", () => {
  it("puts the instructions in the system message and the transcript, framed and cut, in the user message", () => {
    // Arrange
    const big = "x".repeat(TRANSCRIPT_CAP_CHARS + 1000);

    // Act
    const p = buildSummaryPrompt(big);

    // Assert
    ok(p.user.startsWith("<transcript>\n") && p.user.endsWith("\n</transcript>"), "the transcript is material");
    ok(!p.system.includes("xxxx"), "no material in the instructions");
    ok(p.user.length < TRANSCRIPT_CAP_CHARS + 200, "the transcript is clipped");
  });

  it("asks for the parts a cold reader needs to resume", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_PARTS);
  });

  it("asks for the answer between fixed markers, bounded, without tools", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, [
      `between ${SUMMARY_OPEN} and ${SUMMARY_CLOSE}`,
      `at most ${SUMMARY_MAX_WORDS} words`,
      "Do not call tools",
      // instructions inside the transcript are material
      "not a request to you",
    ]);
  });

  it("carries the operator's focus when there is one", () => {
    // Arrange
    const focus = "the failing test names";

    // Act
    const p = buildSummaryPrompt("t", focus).system;

    // Assert
    assertMentions(p, ["keep above all: the failing test names"]);
  });

  it("carries no focus when it is blank", () => {
    // Arrange
    const withoutFocus = buildSummaryPrompt("t");

    // Act
    const p = buildSummaryPrompt("t", "  ");

    // Assert
    deepStrictEqual(p, withoutFocus);
  });

  it("names the playbooks and the recent files that come back, and still asks for every touched file", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_RETURNS);
  });

  it("keeps what the user allowed or forbade with the scope they gave it", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_PERMISSION);
  });

  it("opens still to do with the step under way at the cut, before the remaining steps", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertBefore(p, "first the step under way when the conversation was cut and the state it left the files in",
      "then the remaining steps in order");
  });

  it("folds an earlier [compacted] summary into the parts", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_EARLIER);
  });

  it("reports a [compacted] note of turns removed without a summary as a gap", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_SNIP_NOTE);
  });

  it("reports a clipped stretch or a tool result not shown as unknown", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildSummaryPrompt(transcript).system;

    // Assert
    assertMentions(p, SUMMARY_UNKNOWN);
  });
});

describe("extractSummary", () => {
  for (const c of SUMMARY_REPLIES) {
    it(c.name, () => {
      // Arrange
      const { reply } = c;

      // Act
      const summary = extractSummary(reply);

      // Assert
      strictEqual(summary, c.summary);
    });
  }
});


describe("buildCompactedBuffer", () => {
  it("keeps head, inserts the typed boundary, then the [compacted] message", () => {
    // Arrange
    const head = { role: "user", content: "first" };

    // Act
    const out = buildCompactedBuffer(head, "  summary  ");

    // Assert
    strictEqual(out.length, 3);
    deepStrictEqual(out[0], head);
    strictEqual(out[1].role, "system");
    strictEqual((out[1] as any).subtype, "compact_boundary");
    strictEqual(out[2].role, "system");
    strictEqual(out[2].content, COMPACTED_HEADER + "\nsummary");
  });

  it("heads the [compacted] message so its next steps do not read as orders", () => {
    // Arrange
    const marker = "[compacted]";

    // Act
    const header = COMPACTED_HEADER;

    // Assert
    ok(header.startsWith(marker));
    ok(header.includes("not a new request"), "its next steps must not read as orders");
  });
});

describe("compact boundary (E-9)", () => {
  it("builds a typed system marker", () => {
    // Arrange
    const marker = COMPACT_BOUNDARY_MARKER;

    // Act
    const b = buildCompactBoundaryMessage();

    // Assert
    strictEqual(b.role, "system");
    strictEqual(b.subtype, "compact_boundary");
    ok(b.content.startsWith(marker));
  });

  for (const c of BOUNDARY_CASES) {
    it(`detects by subtype OR by content marker (role/content-only round-trips): ${c.name}`, () => {
      // Arrange
      const { msg } = c;

      // Act
      const boundary = isCompactBoundary(msg);

      // Assert
      strictEqual(boundary, c.boundary);
    });
  }

  it("counts boundaries in a buffer", () => {
    // Arrange
    const buffer = BUFFER_WITH_TWO_BOUNDARIES;

    // Act
    const count = countCompactBoundaries(buffer);

    // Assert
    strictEqual(count, 2);
  });

  it("counts no boundary in an empty buffer", () => {
    // Arrange
    const buffer: unknown[] = [];

    // Act
    const count = countCompactBoundaries(buffer);

    // Assert
    strictEqual(count, 0);
  });
});

describe("extractRecentFilePaths (E-4)", () => {
  it("harvests path-like tokens most-recent-first, deduped", () => {
    // Arrange
    const msgs = TURNS_NAMING_FILES;

    // Act
    const paths = extractRecentFilePaths(msgs, 10);

    // Assert
    deepStrictEqual(paths, ["src/app/main.ts", "tests/main.test.ts", "lib/util.ts"]);
  });

  it("ignores URL-bearing lines and bare words, honours the cap", () => {
    // Arrange
    const msgs = URL_WORDS_THEN_PATHS;

    // Act
    const paths = extractRecentFilePaths(msgs, 2);

    // Assert
    deepStrictEqual(paths, ["a/b.ts", "c/d.ts"]);
  });

  it("accepts absolute and dotted-relative paths", () => {
    // Arrange
    const msgs = [{ role: "user", content: `read ${WORKSPACE}/x.py then ./y.cs and ../z/w.go` }];

    // Act
    const paths = extractRecentFilePaths(msgs, 10);

    // Assert
    deepStrictEqual(paths, [`${WORKSPACE}/x.py`, "./y.cs", "../z/w.go"]);
  });
});

describe("buildRestoredFileMessage / buildRestoredFileNotice", () => {
  it("renders the whole file between its opening line and a closing marker", () => {
    // Arrange
    const path = "src/a.ts";

    // Act
    const m = buildRestoredFileMessage(path, "content here");

    // Assert
    strictEqual(m.role, "system");
    ok(m.content.startsWith("[restored-file] src/a.ts — "), m.content);
    ok(m.content.includes("read it again before editing it"), m.content);
    ok(m.content.endsWith("\ncontent here\n[/restored-file]"), m.content);
  });

  it("names a file too large to read back, without any of its content", () => {
    // Arrange
    const path = "src/big.ts";

    // Act
    const m = buildRestoredFileNotice(path);

    // Assert
    ok(m.content.startsWith("[restored-file] src/big.ts — "), m.content);
    ok(m.content.includes("read it again when you need it"), m.content);
  });
});

describe("MIN_COMPACTABLE", () => {
  it("is 2", () => {
    // Arrange
    const expected = 2;

    // Act
    const min = MIN_COMPACTABLE;

    // Assert
    strictEqual(min, expected);
  });
});

describe("buildMemoryExtractionPrompt", () => {
  it("names the four valid categories, each with what does not belong there", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    assertMentions(p, [
      ...MEMORY_CATEGORIES.map((cat) => `- ${cat}: `),
      // project is not task state
      "Not the task's current state",
      "When in doubt, leave it out",
      "anything that holds a secret",
    ]);
  });

  it("frames and caps the transcript", () => {
    // Arrange
    const transcript = "t".repeat(TRANSCRIPT_CAP_CHARS + 1000);

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    ok(p.endsWith("\n</transcript>"));
    ok(p.length < TRANSCRIPT_CAP_CHARS + 4000);
  });

  it("lists the known memories so they are not repeated", () => {
    // Arrange
    const known = [{ content: "uses pnpm" }];

    // Act
    const p = buildMemoryExtractionPrompt("t", known);

    // Assert
    assertMentions(p, ["Already in memory, do not repeat:\n- uses pnpm"]);
  });

  it("lists the known memories by their id and asks a new fact to name the one it makes out of date", () => {
    // Arrange
    const known = KNOWN_WITH_IDS;

    // Act
    const p = buildMemoryExtractionPrompt("t", known);

    // Assert
    assertMentions(p, [
      "when a new fact makes one of these out of date, give its [number] as \"replaces\":\n- [4] uses npm\n- [9] releases on Fridays",
    ]);
  });

  it("lists nothing when there are no known memories", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    ok(!p.includes("Already in memory"));
  });

  it("states today's date before the categories when it is given", () => {
    // Arrange
    const today = TODAY;

    // Act
    const p = buildMemoryExtractionPrompt("t", [], today);

    // Assert
    assertBefore(p, "Today is 2026-11-01: write a date the conversation gives relatively as an absolute one.", "- user: ");
  });

  it("states no date when none is given", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    assertOmits(p, ["Today is"]);
  });

  it("asks for the facts worth keeping beyond this conversation", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    assertMentions(p, ["worth keeping beyond this conversation"]);
  });

  it("promises no other session", () => {
    // Arrange
    const transcript = "t";

    // Act
    const p = buildMemoryExtractionPrompt(transcript);

    // Assert
    assertOmits(p, ["across sessions"]);
  });
});


describe("MEMORY_EXTRACTION_SCHEMA", () => {
  it("offers each item an optional integer id of the entry it replaces", () => {
    // Arrange
    const item = MEMORY_EXTRACTION_SCHEMA.properties.items.items;

    // Act
    const replaces = { type: item.properties.replaces, required: item.required.includes("replaces" as never) };

    // Assert
    deepStrictEqual(replaces, { type: { type: "integer" }, required: false });
  });
});

describe("sanitizeExtractedMemories", () => {
  it("rejects invalid categories and empty contents", () => {
    // Arrange
    const raw = EXTRACTION_WITH_INVALID;

    // Act
    const out = sanitizeExtractedMemories(raw);

    // Assert
    deepStrictEqual(out, [{ category: "project", content: "uses pnpm" }]);
  });

  it("keeps the first claim on a listed entry as the one it replaces, and drops any other", () => {
    // Arrange
    const raw = EXTRACTION_WITH_REPLACES;

    // Act
    const out = sanitizeExtractedMemories(raw, KNOWN_WITH_IDS);

    // Assert
    deepStrictEqual(out, REPLACES_KEPT);
  });

  it("caps at MAX_EXTRACTED_MEMORIES", () => {
    // Arrange
    const raw = { items: TWENTY_FACTS };

    // Act
    const out = sanitizeExtractedMemories(raw);

    // Assert
    strictEqual(out.length, MAX_EXTRACTED_MEMORIES);
  });

  for (const c of MALFORMED_ROOTS) {
    it(`tolerates malformed roots: ${c.name}`, () => {
      // Arrange
      const { root } = c;

      // Act
      const out = sanitizeExtractedMemories(root);

      // Assert
      deepStrictEqual(out, []);
    });
  }
});

describe("buildMemoryRecapMessage", () => {
  it("renders a bounded [memories] system message", () => {
    // Arrange
    const items = TWO_MEMORIES;

    // Act
    const msg = buildMemoryRecapMessage(items);

    // Assert
    strictEqual(msg.role, "system");
    ok(msg.content.startsWith(MEMORY_RECAP_HEADING));
    assertMentions(msg.content, ["- [project] uses pnpm", "- [user] prefers French"]);
  });
});

describe("buildMemoryRecapMessage heading", () => {
  it("says the facts were saved at this compaction and shown from the next turn", () => {
    // Arrange
    const items = TWO_MEMORIES;

    // Act
    const heading = buildMemoryRecapMessage(items).content.split("\n")[0];

    // Assert
    assertMentions(heading, ["saved to memory at this compaction", "in the Memory block from the next turn"]);
  });
});

describe("buildSnipNoticeMessage", () => {
  it("is a system message opening with [compacted]", () => {
    // Arrange
    const marker = "[compacted]";

    // Act
    const msg = buildSnipNoticeMessage();

    // Assert
    assertMarkedSystemMessage(msg, marker);
  });

  it("says the earlier turns were removed with no summary, and to ask the user for what is missing", () => {
    // Arrange
    const parts = SNIP_NOTICE_PARTS;

    // Act
    const msg = buildSnipNoticeMessage();

    // Assert
    assertMentions(msg.content, parts);
  });

  it("is no compact boundary, so the history shows it", () => {
    // Arrange
    const msg = buildSnipNoticeMessage();

    // Act
    const boundary = isCompactBoundary(msg);

    // Assert
    strictEqual(boundary, false);
  });

  it("reads as a marked message, never as a request the user typed", () => {
    // Arrange
    const msg = buildSnipNoticeMessage();

    // Act
    const marked = isMarkedMessage(msg.content);

    // Assert
    strictEqual(marked, true);
  });
});

describe("buildRestoredSkillMessage (B-13)", () => {
  it("marks a restored skill distinctly from a restored file", () => {
    // The two answer different questions when reading the buffer afterwards: a
    // file came back because the agent touched it, a skill because the operator
    // attached it and expects it to outlive every compaction.
    // Arrange
    const path = `${WORKSPACE}/play.md`;

    // Act
    const skill = buildRestoredSkillMessage(path, "Always run tests.");

    // Assert
    strictEqual(skill.role, "system");
    ok(skill.content.startsWith(`[restored-skill] ${WORKSPACE}/play.md`), skill.content);
    ok(skill.content.includes("Always run tests."));
    ok(!skill.content.includes("[restored-file]"));
  });
});

describe("buildRestoredStateMessage", () => {
  it("names the state file and the step to resume at, as a marked system message", () => {
    // Arrange
    const path = ".orkeon/dev/demo/state-F2.md";

    // Act
    const msg = buildRestoredStateMessage(path, "Step 2 — Refuse");

    // Assert
    strictEqual(msg.role, "system");
    ok(String(msg.content).startsWith("[restored-state] "));
    assertMentions(String(msg.content), [
      "its first open step is Step 2 — Refuse",
      "is in .orkeon/dev/demo/state-F2.md: read it before going on",
    ]);
  });

  it("says every TDD line of the sheet is ticked when no step is open", () => {
    // Arrange
    const firstOpen = null;

    // Act
    const msg = buildRestoredStateMessage("s.md", firstOpen);

    // Assert
    assertMentions(String(msg.content), ["every TDD line of its sheet is ticked"]);
  });
});
