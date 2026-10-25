// The model and memory store extractMemories is tested over.
import { FakeLlm } from "../../../../tests/support/doubles/fake-llm.ts";
import { FakeMemoryStore } from "../../../../tests/support/doubles/fake-memory-store.ts";

/** A model whose extraction answers `extraction`, and an empty memory store. */
export function memoriesSetup(extraction: unknown) {
  const llm = new FakeLlm();
  llm.extractions = [extraction];
  return { llm, memory: new FakeMemoryStore() };
}

/** Two durable facts, the second with blanks around it. */
export const TWO_FACTS = {
  items: [
    { category: "project", content: "uses pnpm workspaces" },
    { category: "user", content: " prefers terse answers " },
  ],
};

/** TWO_FACTS as extractMemories returns them, trimmed. */
export const TWO_FACTS_KEPT = [
  { category: "project", content: "uses pnpm workspaces" },
  { category: "user", content: "prefers terse answers" },
];

export const UNKNOWN_OR_EMPTY = { items: [{ category: "bogus", content: "x" }, { category: "feedback", content: "  " }] };
export const REFERENCE_AND_PROJECT = { items: [{ category: "reference", content: "docs at /docs" }, { category: "project", content: "monorepo" }] };
