// Memory stores /memory is run over.
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
