// Memory stores /memory is run over, the texts of its /feedback alias and the lines an admission is routed from.
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";

export type MemoryRecord = { id: number; category: string; content: string };

/** A store holding `records`, as the store saved them. */
export function memoryWith(records: readonly MemoryRecord[] = []): FakeMemoryStore {
  const memory = new FakeMemoryStore();
  memory.records = records.map((r) => ({ ...r }));
  return memory;
}

export const PREFERS_TABS: MemoryRecord = { id: 1, category: "user", content: "prefers tabs" };
export const USES_PNPM: MemoryRecord = { id: 2, category: "project", content: "uses pnpm" };

export const FEEDBACK_RECORDED = "feedback recorded — the agent replays feedback memories on every /assistant turn.";
export const FEEDBACK_USAGE = "usage: /feedback <what should change or keep happening>";

/** The lines of /memory and its aliases, with the admit arguments each hands over (null: not an admission). */
export const ADMIT_TOKEN_CASES: readonly { name: string; typed: string; tokens: string[]; expected: string[] | null }[] = [
  { name: "reads /memory admit <ids> as an admission of those ids", typed: "memory", tokens: ["admit", "a-b", "c"], expected: ["a-b", "c"] },
  { name: "reads /memory admit --list as the admission's list", typed: "memory", tokens: ["admit", "--list"], expected: ["--list"] },
  { name: "reads every token of /memory-admit as the admit arguments", typed: "memory-admit", tokens: ["--refuse", "a-b"], expected: ["--refuse", "a-b"] },
  { name: "reads a bare /memory-admit as an admission of every candidate", typed: "memory-admit", tokens: [], expected: [] },
  { name: "reads /memory list as no admission", typed: "memory", tokens: ["list"], expected: null },
  { name: "reads /feedback admit as no admission", typed: "feedback", tokens: ["admit", "it"], expected: null },
];
