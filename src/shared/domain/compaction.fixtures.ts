// Buffers, replies and extracted memories for the compaction tests.
import { buildCompactBoundaryMessage, COMPACT_BOUNDARY_MARKER } from "./compaction.ts";

/** A transcript whose head, middle and tail are told apart: 100 H, 800 M, 300 T. */
export const HEAD_MIDDLE_TAIL = "H".repeat(100) + "M".repeat(800) + "T".repeat(300);

/** The parts a cold reader needs to resume, and what the summary prompt must say of the history. */
export const SUMMARY_PARTS: readonly string[] = [
  "The request:",
  "The user's own words that still apply",
  "Done and checked:",
  "Learned:",
  "Still to do:",
  "The user's latest request, quoted",
  // the prompt must say the history is replaced
  "will be replaced by your summary",
  // what is restored anyway is not repeated
  "come back on their own",
];

/** Replies of the summary call and the summary each holds. */
export const SUMMARY_REPLIES: readonly { readonly name: string; readonly reply: string; readonly summary: string }[] = [
  { name: "keeps what the markers enclose", reply: "Here it is:\n<summary>\n1. The request: fix\n</summary>\nDone.", summary: "1. The request: fix" },
  { name: "takes the whole reply when the markers are missing", reply: "  1. The request: fix  ", summary: "1. The request: fix" },
  { name: "strips a stray marker", reply: "<summary>1. The request: fix", summary: "1. The request: fix" },
  { name: "is empty for an empty reply", reply: "", summary: "" },
  { name: "is empty for a blank summary between the markers", reply: "<summary>  </summary>", summary: "" },
];

/** Messages and whether each is a compact boundary: by subtype OR by content marker. */
export const BOUNDARY_CASES: readonly { readonly name: string; readonly msg: unknown; readonly boundary: boolean }[] = [
  { name: "detects a typed marker by its subtype", msg: buildCompactBoundaryMessage(), boundary: true },
  {
    name: "detects a role/content-only round-trip by its content marker",
    msg: { role: "system", content: COMPACT_BOUNDARY_MARKER },
    boundary: true,
  },
  { name: "takes a [compacted] message for no boundary", msg: { role: "system", content: "[compacted]\nfoo" }, boundary: false },
];

/** A buffer holding two boundaries: one typed, one by its content marker. */
export const BUFFER_WITH_TWO_BOUNDARIES = [
  { role: "user", content: "hi" },
  buildCompactBoundaryMessage(),
  { role: "system", content: "[compacted]\ns" },
  { role: "system", content: COMPACT_BOUNDARY_MARKER },
];

/** Two turns naming files, one of them twice. */
export const TURNS_NAMING_FILES = [
  { role: "user", content: "look at src/app/main.ts and lib/util.ts" },
  { role: "assistant", content: "edited src/app/main.ts, added tests/main.test.ts" },
];

/** A URL, bare words, then three paths. */
export const URL_WORDS_THEN_PATHS = [
  { role: "user", content: "see https://example.com/a/b.ts for details" },
  { role: "user", content: "plain words no paths" },
  { role: "user", content: "a/b.ts c/d.ts e/f.ts" },
];

/** The four valid memory categories. */
export const MEMORY_CATEGORIES: readonly string[] = ["user", "project", "feedback", "reference"];

/** An extraction with one valid item, an invalid category, a blank content and a missing one. */
export const EXTRACTION_WITH_INVALID = {
  items: [
    { category: "project", content: "uses pnpm" },
    { category: "banana", content: "nope" },
    { category: "user", content: "   " },
    { category: "user" },
  ],
};

/** Twenty valid facts. */
export const TWENTY_FACTS = Array.from({ length: 20 }, (_, i) => ({ category: "user", content: `fact ${i}` }));

/** Roots that hold no list of items. */
export const MALFORMED_ROOTS: readonly { readonly name: string; readonly root: unknown }[] = [
  { name: "a null root", root: null },
  { name: "items that are no list", root: { items: "not-an-array" } },
];

export const TWO_MEMORIES = [
  { category: "project", content: "uses pnpm" },
  { category: "user", content: "prefers French" },
];
