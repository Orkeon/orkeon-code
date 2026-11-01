// Buffers, replies and extracted memories for the compaction tests.
import { buildCompactBoundaryMessage, COMPACT_BOUNDARY_MARKER } from "../../../src/shared/domain/compaction.ts";

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

/** What the summary prompt says comes back on its own, and what the summary still names. */
export const SUMMARY_RETURNS: readonly string[] = [
  "the attached playbooks",
  "a few of the files most recently named",
  "a large one by its name alone, not its content",
  "still name every file the work touched and the change made to it",
];

/** What the summary prompt keeps of a permission the user gave or refused. */
export const SUMMARY_PERMISSION: readonly string[] = [
  "what they allowed or forbade",
  "with the scope they gave it",
  "no permission grows wider or goes missing",
];

/** How the summary prompt treats an earlier [compacted] summary found in the transcript. */
export const SUMMARY_EARLIER: readonly string[] = [
  "opening with [compacted] is an earlier summary",
  "Spread an earlier summary's facts over the parts above",
  "neither dropping it nor pasting it as one block",
];

/** How the summary prompt treats a [compacted] note of turns removed without a summary. */
export const SUMMARY_SNIP_NOTE: readonly string[] = [
  "or a note that turns were removed without one",
  "report such a note as a gap, under Still to do or Learned",
];

/** How the summary prompt treats a clipped stretch or a tool call whose result is not shown. */
export const SUMMARY_UNKNOWN: readonly string[] = [
  "says characters were left out",
  "a [tools] line shows no result",
  "report it as unknown, never fill it in",
];

/** The date handed to the memory extraction. */
export const TODAY = "2026-11-01";

/** The heading line of the [memories] recap. */
export const MEMORY_RECAP_HEADING =
  "[memories] Facts saved to memory at this compaction, shown in the Memory block from the next turn:\n";

/** What the snip notice tells the agent. */
export const SNIP_NOTICE_PARTS: readonly string[] = [
  "Earlier turns were removed to free the context",
  "no summary of them was written",
  "ask the user for whatever is missing",
];
