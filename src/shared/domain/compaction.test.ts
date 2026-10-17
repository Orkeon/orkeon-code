// Moved from crews/session-compact/domain/ (F3.2) + new memory-extraction cases.
// Run: node_modules/.bin/tsx --test shared/domain/compaction.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  COMPACT_BOUNDARY_MARKER,
  MIN_COMPACTABLE,
  buildCompactBoundaryMessage,
  buildCompactedBuffer,
  buildMemoryExtractionPrompt,
  buildMemoryRecapMessage,
  buildRestoredFileMessage,
  buildSummaryPrompt,
  buildTranscript,
  countCompactBoundaries,
  extractRecentFilePaths,
  isCompactBoundary,
  sanitizeExtractedMemories,
  buildRestoredSkillMessage,
} from "./compaction.ts";
import { MAX_EXTRACTED_MEMORIES } from "./compaction-thresholds.ts";

describe("buildTranscript", () => {
  it("renders role: content lines", () => {
    strictEqual(
      buildTranscript([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]),
      "user: hi\nassistant: yo",
    );
  });
});

describe("buildSummaryPrompt", () => {
  it("includes the transcript and caps at 16000 chars", () => {
    const big = "x".repeat(20000);
    const p = buildSummaryPrompt(big);
    ok(p.includes("PRESERVE"));
    ok(p.endsWith("x".repeat(16000)));
  });

  it("asks for the five continuation sections (corpus compaction template)", () => {
    // The summary REPLACES the history — it must be a continuation document,
    // not a recap. Each section name is load-bearing: dropping one reverts to
    // the old three-line prompt whose summaries lost the plan first.
    const p = buildSummaryPrompt("t");
    for (const section of [
      "Task overview",
      "Current state",
      "Important discoveries",
      "Next steps",
      "Context to preserve",
    ]) ok(p.includes(section), `missing section: ${section}`);
    ok(p.includes("resume from it alone"), "the prompt must say the history is replaced");
  });
});

describe("buildCompactedBuffer", () => {
  it("keeps head, inserts the typed boundary (E-9), then the [compacted] message", () => {
    const head = { role: "user", content: "first" };
    const out = buildCompactedBuffer(head, "  summary  ");
    strictEqual(out.length, 3);
    deepStrictEqual(out[0], head);
    strictEqual(out[1].role, "system");
    strictEqual((out[1] as any).subtype, "compact_boundary");
    strictEqual(out[2].role, "system");
    strictEqual(out[2].content, "[compacted]\nsummary");
  });
});

describe("compact boundary (E-9)", () => {
  it("builds a typed system marker", () => {
    const b = buildCompactBoundaryMessage();
    strictEqual(b.role, "system");
    strictEqual(b.subtype, "compact_boundary");
    ok(b.content.startsWith(COMPACT_BOUNDARY_MARKER));
  });
  it("detects by subtype OR by content marker (role/content-only round-trips)", () => {
    ok(isCompactBoundary(buildCompactBoundaryMessage()));
    ok(isCompactBoundary({ role: "system", content: COMPACT_BOUNDARY_MARKER }));
    strictEqual(isCompactBoundary({ role: "system", content: "[compacted]\nfoo" }), false);
  });
  it("counts boundaries in a buffer", () => {
    strictEqual(countCompactBoundaries([
      { role: "user", content: "hi" },
      buildCompactBoundaryMessage(),
      { role: "system", content: "[compacted]\ns" },
      { role: "system", content: COMPACT_BOUNDARY_MARKER },
    ]), 2);
    strictEqual(countCompactBoundaries([]), 0);
  });
});

describe("extractRecentFilePaths (E-4)", () => {
  it("harvests path-like tokens most-recent-first, deduped", () => {
    const msgs = [
      { role: "user", content: "look at src/app/main.ts and lib/util.ts" },
      { role: "assistant", content: "edited src/app/main.ts, added tests/main.test.ts" },
    ];
    deepStrictEqual(
      extractRecentFilePaths(msgs, 10),
      ["src/app/main.ts", "tests/main.test.ts", "lib/util.ts"],
    );
  });
  it("ignores URL-bearing lines and bare words, honours the cap", () => {
    const msgs = [
      { role: "user", content: "see https://example.com/a/b.ts for details" },
      { role: "user", content: "plain words no paths" },
      { role: "user", content: "a/b.ts c/d.ts e/f.ts" },
    ];
    deepStrictEqual(extractRecentFilePaths(msgs, 2), ["a/b.ts", "c/d.ts"]);
  });
  it("accepts absolute and dotted-relative paths", () => {
    const msgs = [{ role: "user", content: "read /workspace/x.py then ./y.cs and ../z/w.go" }];
    deepStrictEqual(
      extractRecentFilePaths(msgs, 10),
      ["/workspace/x.py", "./y.cs", "../z/w.go"],
    );
  });
});

describe("buildRestoredFileMessage (E-4)", () => {
  it("renders the [restored-file] system message", () => {
    const m = buildRestoredFileMessage("src/a.ts", "content here");
    strictEqual(m.role, "system");
    strictEqual(m.content, "[restored-file] src/a.ts\ncontent here");
  });
});

describe("MIN_COMPACTABLE", () => {
  it("is 2", () => strictEqual(MIN_COMPACTABLE, 2));
});

describe("buildMemoryExtractionPrompt", () => {
  it("names the four valid categories and caps the transcript", () => {
    const p = buildMemoryExtractionPrompt("t".repeat(20000));
    for (const cat of ["user", "project", "feedback", "reference"]) ok(p.includes(cat));
    ok(p.endsWith("t".repeat(16000)));
  });
});

describe("sanitizeExtractedMemories", () => {
  it("rejects invalid categories and empty contents", () => {
    const out = sanitizeExtractedMemories({
      items: [
        { category: "project", content: "uses pnpm" },
        { category: "banana", content: "nope" },
        { category: "user", content: "   " },
        { category: "user" },
      ],
    });
    deepStrictEqual(out, [{ category: "project", content: "uses pnpm" }]);
  });

  it("caps at MAX_EXTRACTED_MEMORIES and tolerates malformed roots", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ category: "user", content: `fact ${i}` }));
    strictEqual(sanitizeExtractedMemories({ items: many }).length, MAX_EXTRACTED_MEMORIES);
    deepStrictEqual(sanitizeExtractedMemories(null), []);
    deepStrictEqual(sanitizeExtractedMemories({ items: "not-an-array" }), []);
  });
});

describe("buildMemoryRecapMessage", () => {
  it("renders a bounded [memories] system message", () => {
    const msg = buildMemoryRecapMessage([
      { category: "project", content: "uses pnpm" },
      { category: "user", content: "prefers French" },
    ]);
    strictEqual(msg.role, "system");
    ok(msg.content.startsWith("[memories]\n"));
    ok(msg.content.includes("- [project] uses pnpm"));
    ok(msg.content.includes("- [user] prefers French"));
  });
});

describe("buildRestoredSkillMessage (B-13)", () => {
  it("marks a restored skill distinctly from a restored file", () => {
    // The two answer different questions when reading the buffer afterwards: a
    // file came back because the agent touched it, a skill because the operator
    // attached it and expects it to outlive every compaction.
    const skill = buildRestoredSkillMessage("/workspace/play.md", "Always run tests.");
    strictEqual(skill.role, "system");
    ok(skill.content.startsWith("[restored-skill] /workspace/play.md"), skill.content);
    ok(skill.content.includes("Always run tests."));
    ok(!skill.content.includes("[restored-file]"));
  });
});
