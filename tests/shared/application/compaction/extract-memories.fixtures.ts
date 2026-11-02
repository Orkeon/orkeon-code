// The model and memory store extractMemories is tested over.
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";

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

/** A fact that makes the known entry 1 out of date. */
export const REPLACING_FACT = { items: [{ category: "project", content: "uses pnpm 9", replaces: 1 }] };

/** A fact of the category `user` that names the known entry 1, of the category `project`. */
export const CROSS_CATEGORY_FACT = { items: [{ category: "user", content: "prefers pnpm 9", replaces: 1 }] };

/** The entry 1 REPLACING_FACT makes out of date. */
export const STALE_ENTRY = { id: 1, category: "project", content: "uses pnpm 8" };

/** A memory store holding STALE_ENTRY. */
export function storeWithStaleEntry(extraction: unknown) {
  const setup = memoriesSetup(extraction);
  setup.memory.records = [{ ...STALE_ENTRY }];
  return setup;
}

export const UNKNOWN_OR_EMPTY = { items: [{ category: "bogus", content: "x" }, { category: "feedback", content: "  " }] };
export const REFERENCE_AND_PROJECT = { items: [{ category: "reference", content: "docs at /docs" }, { category: "project", content: "monorepo" }] };
