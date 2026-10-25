// The harness's MEMORY.md and notes the import is tested on.

/** An index: a linked item, a free-text item continued on an indented line, a link out of the folder, then lines that are no item. */
export const INDEX = [
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

/** The items INDEX holds. */
export const INDEX_ITEMS = [
  { line: 3, title: "dev-learn port review", hook: "L-3: parity held statically", note: "dev-learn-port-review.md" },
  { line: 4, title: "Run the contract tests first when a suite exists so a broken port fails fast",
    hook: "Run the contract tests first when a suite exists so a broken port fails fast" },
  { line: 6, title: "outside", hook: "a link out of the folder" },
];

/** A note with a front matter, a body line, then its Why and How to apply on one line. */
export const NOTE_WITH_FRONT_MATTER =
  "---\nname: x\nmetadata:\n  type: project\n---\n\nBody line.\n\n**Why:** saves a search. **How to apply:** check the case first.\n";

/** The import context: the agent whose memory is read, the project, the date. */
export const ctx = { agent: "adversarial-reviewer", project: "shop", date: "2026-10-24" };

/** What the entry made of INDEX's first item names in its body. */
export const IMPORTED_BODY_MENTIONS: readonly string[] = [
  "`.claude/agent-memory/adversarial-reviewer/MEMORY.md:3`",
  "`.claude/agent-memory/adversarial-reviewer/dev-learn-port-review.md`",
];
