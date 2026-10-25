// The memory, the clock, the tool input and the racing files the memory_push tests run over.
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { LiveListingFiles } from "../../../../tests/support/live-listing-files.ts";

export const layout = memoryLayout(".orkeon/memory");
export const memory = { layout, project: "shop" };
export const clock = () => new Date("2026-10-24T10:00:00Z");
export const ID = "shop-method-20261024-run-the-contract-tests-first";
export const CANDIDATE_PATH = `${layout.candidates}/${ID}.md`;

/** A valid method the tool is handed. */
export const input = {
  type: "method", title: "Run the contract tests first", topic: "contract tests first",
  applies_when: "a module has a contract test suite", rationale: "the slow suite hides the contract failure",
  evidence: ["src/app/main.ts:10"], tags: ["Testing"],
};

/** Pushes refused over a memory whose refused.md holds the topic contract-tests-first, each with what the refusal says. */
export const REFUSED_PUSHES: ReadonlyArray<{ name: string; input: Record<string, unknown>; says: string }> = [
  { name: "a refused topic", input, says: "was refused" },
  { name: "an invalid entry (a mistake without its correction)", input: { ...input, type: "mistake", topic: "other" }, says: "a mistake needs correction" },
  { name: "a secret-like evidence file", input: { ...input, topic: "x", evidence: [".env:1"] }, says: "secret-like" },
  { name: "an input missing its fields", input: { type: "method" }, says: "title, topic, applies_when, rationale required" },
];

/** Tool inputs readPushInput refuses. */
export const UNREADABLE_INPUTS = [
  { name: "a type that is no entry type", input: { ...input, type: "rule" } },
  { name: "no evidence", input: { ...input, evidence: [] } },
] as const;

/** Files over `files` where another push overwrites the candidate at `path` right after its first write. */
export function racingFiles(files: LiveListingFiles, path: string): LiveListingFiles {
  let raced = false;
  return Object.assign(Object.create(files), {
    write: async (p: string, content: string) => {
      await files.write(p, content);
      if (p === path && !raced) { raced = true; await files.write(p, content.replace("the slow suite", "another push")); }
    },
  });
}
