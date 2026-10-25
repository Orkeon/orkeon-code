// The memory, files and settings stepPrecedents recalls from.
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { FakeSharedMemory } from "../../../../tests/support/doubles/fake-shared-memory.ts";
import { entryText } from "../../../../tests/support/fixtures/memory-entries.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeLogger } from "../../../../tests/support/doubles/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";

const layout = memoryLayout(".orkeon/memory");
const pathOf = (e: MemoryEntry) => `${layout.entries}/${e.type}/${e.id}.md`;

/**
 * The dependencies of stepPrecedents: each entry written to its file and hit by the index, best first; the settings
 * answering `values` and counting their reads in `reads()`.
 */
export function setup(entries: MemoryEntry[], values: Record<string, string> = { "memory.project": "shop" }) {
  const memory = new FakeSharedMemory();
  const files = new FakeFiles();
  entries.forEach((e, i) => {
    files.files.set(pathOf(e), entryText(e));
    memory.hits.push({ sourceId: pathOf(e), score: 1 - i / 10 });
  });
  let reads = 0;
  const config = { readValue: async (key: string) => { reads++; return { key, value: values[key], source: "file" } as never; } };
  const log = new FakeLogger();
  return { memory, files, config, shell: new FakeShell(), log, reads: () => reads };
}

/** The types of temp/05 § 4.1 each trigger recalls. */
export const EXPECTED_TRIGGER_TYPES = {
  T1: ["decision", "method"], T2: ["decision", "code-structure"], T3: ["code-structure", "mistake"],
  T4: ["mistake"], T5: ["mistake"],
};
