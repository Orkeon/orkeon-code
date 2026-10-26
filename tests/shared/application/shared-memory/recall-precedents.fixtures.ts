// Admitted entries in FakeFiles and their hits in FakeSharedMemory, for the recall tests.
import { memoryLayout } from "../../../../src/shared/domain/shared-memory/layout.ts";
import type { MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";
import { FakeSharedMemory } from "../../../support/doubles/fake-shared-memory.ts";
import { entryText, sampleEntry } from "../../../support/fixtures/memory-entries.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";

export const layout = memoryLayout(".orkeon/memory");
export const memorySettings = { layout, collection: "memory-shop" };
export const pathOf = (e: MemoryEntry) => `${layout.entries}/${e.type}/${e.id}.md`;

/** Each entry written to its file, and a hit on it with its score, in the order given. */
export function setup(entries: Array<[MemoryEntry, number]>) {
  const memory = new FakeSharedMemory();
  const files = new FakeFiles();
  for (const [entry, score] of entries) {
    files.files.set(pathOf(entry), entryText(entry));
    memory.hits.push({ sourceId: pathOf(entry), score });
  }
  return { memory, files };
}

/** Seven admitted methods, best first. */
export const sevenMethods = (): Array<[MemoryEntry, number]> =>
  Array.from({ length: 7 }, (_, i): [MemoryEntry, number] => [sampleEntry("method", `m${i}`), 1 - i / 10]);
