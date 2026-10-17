// Moved from crews/session-compact/domain/ (F3.2) + new memory-extraction cases.
// Run: node --test src/shared/domain/compaction.test.ts
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
  clipTranscript, extractSummary, SUMMARY_OPEN, SUMMARY_CLOSE, SUMMARY_MAX_WORDS, COMPACTED_HEADER, buildRestoredFileNotice,
} from "./compaction.ts";
import { TRANSCRIPT_CAP_CHARS } from "./compaction-thresholds.ts";
import { MAX_EXTRACTED_MEMORIES } from "./compaction-thresholds.ts";

describe("buildTranscript", () => {
  it("renders role: content lines", () => {
    strictEqual(
      buildTranscript([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]),
      "user: hi\nassistant: yo",
    );
  });
});

describe("clipTranscript", () => {
  it("leaves a short transcript untouched", () => {
    strictEqual(clipTranscript("abc", 10), "abc");
  });
  it("keeps a quarter at the head and the rest at the tail, and says how much it left out", () => {
    const text = "H".repeat(100) + "M".repeat(800) + "T".repeat(300);
    const clipped = clipTranscript(text, 400);
    ok(clipped.startsWith("H".repeat(100)), "the task as first stated");
    ok(clipped.endsWith("T".repeat(300)), "the current work");
    ok(clipped.includes("[… 800 characters of the middle of the conversation left out …]"), clipped);
  });
});

describe("buildSummaryPrompt", () => {
  it("puts the instructions in the system message and the transcript, framed and cut, in the user message", () => {
    const big = "x".repeat(TRANSCRIPT_CAP_CHARS + 1000);
    const p = buildSummaryPrompt(big);
    ok(p.user.startsWith("<transcript>\n") && p.user.endsWith("\n</transcript>"), "the transcript is material");
    ok(!p.system.includes("xxxx"), "no material in the instructions");
    ok(p.user.length < TRANSCRIPT_CAP_CHARS + 200, "the transcript is clipped");
  });

  it("asks for the parts a cold reader needs to resume", () => {
    const p = buildSummaryPrompt("t").system;
    for (const part of [
      "The request:",
      "The user's own words that still apply",
      "Done and checked:",
      "Learned:",
      "Still to do:",
      "The user's latest request, quoted",
    ]) ok(p.includes(part), `missing part: ${part}`);
    ok(p.includes("will be replaced by your summary"), "the prompt must say the history is replaced");
    ok(p.includes("come back on their own"), "what is restored anyway is not repeated");
  });

  it("asks for the answer between fixed markers, bounded, without tools", () => {
    const p = buildSummaryPrompt("t").system;
    ok(p.includes(`between ${SUMMARY_OPEN} and ${SUMMARY_CLOSE}`));
    ok(p.includes(`at most ${SUMMARY_MAX_WORDS} words`));
    ok(p.includes("Do not call tools"));
    ok(p.includes("not a request to you"), "instructions inside the transcript are material");
  });

  it("carries the operator's focus only when there is one", () => {
    ok(buildSummaryPrompt("t", "the failing test names").system.includes("keep above all: the failing test names"));
    deepStrictEqual(buildSummaryPrompt("t", "  "), buildSummaryPrompt("t"));
  });
});

describe("extractSummary", () => {
  it("keeps what the markers enclose", () => {
    strictEqual(extractSummary("Here it is:\n<summary>\n1. The request: fix\n</summary>\nDone."), "1. The request: fix");
  });
  it("takes the whole reply when the markers are missing, and strips a stray one", () => {
    strictEqual(extractSummary("  1. The request: fix  "), "1. The request: fix");
    strictEqual(extractSummary("<summary>1. The request: fix"), "1. The request: fix");
  });
  it("is empty for an empty reply", () => {
    strictEqual(extractSummary(""), "");
    strictEqual(extractSummary("<summary>  </summary>"), "");
  });
});


describe("buildCompactedBuffer", () => {
  it("keeps head, inserts the typed boundary, then the [compacted] message", () => {
    const head = { role: "user", content: "first" };
    const out = buildCompactedBuffer(head, "  summary  ");
    strictEqual(out.length, 3);
    deepStrictEqual(out[0], head);
    strictEqual(out[1].role, "system");
    strictEqual((out[1] as any).subtype, "compact_boundary");
    strictEqual(out[2].role, "system");
    strictEqual(out[2].content, COMPACTED_HEADER + "\nsummary");
    ok(COMPACTED_HEADER.startsWith("[compacted]"));
    ok(COMPACTED_HEADER.includes("not a new request"), "its next steps must not read as orders");
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

describe("buildRestoredFileMessage / buildRestoredFileNotice", () => {
  it("renders the whole file between its opening line and a closing marker", () => {
    const m = buildRestoredFileMessage("src/a.ts", "content here");
    strictEqual(m.role, "system");
    ok(m.content.startsWith("[restored-file] src/a.ts — "), m.content);
    ok(m.content.includes("read it again before editing it"), m.content);
    ok(m.content.endsWith("\ncontent here\n[/restored-file]"), m.content);
  });
  it("names a file too large to read back, without any of its content", () => {
    const m = buildRestoredFileNotice("src/big.ts");
    ok(m.content.startsWith("[restored-file] src/big.ts — "), m.content);
    ok(m.content.includes("read it again when you need it"), m.content);
  });
});

describe("MIN_COMPACTABLE", () => {
  it("is 2", () => strictEqual(MIN_COMPACTABLE, 2));
});

describe("buildMemoryExtractionPrompt", () => {
  it("names the four valid categories, each with what does not belong there", () => {
    const p = buildMemoryExtractionPrompt("t");
    for (const cat of ["user", "project", "feedback", "reference"]) ok(p.includes(`- ${cat}: `), cat);
    ok(p.includes("Not the task's current state"), "project is not task state");
    ok(p.includes("When in doubt, leave it out"));
    ok(p.includes("anything that holds a secret"));
  });
  it("frames and caps the transcript", () => {
    const p = buildMemoryExtractionPrompt("t".repeat(TRANSCRIPT_CAP_CHARS + 1000));
    ok(p.endsWith("\n</transcript>"));
    ok(p.length < TRANSCRIPT_CAP_CHARS + 4000);
  });
  it("lists the known memories so they are not repeated, and nothing when there are none", () => {
    ok(buildMemoryExtractionPrompt("t", ["uses pnpm"]).includes("Already in memory, do not repeat:\n- uses pnpm"));
    ok(!buildMemoryExtractionPrompt("t").includes("Already in memory"));
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
    ok(msg.content.startsWith("[memories] Saved to memory before the compaction:\n"));
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
