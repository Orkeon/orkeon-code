// The memory, the clock and the world of candidates the admitEntries tests run over.
import { sha1Hex } from "../../../../src/shared/domain/sha1.ts";
import { memoryLayout } from "../../../../src/shared/domain/shared-memory/layout.ts";
import type { MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { LiveListingFiles } from "../../../support/doubles/live-listing-files.ts";
import { FakeSharedMemory } from "../../../support/doubles/fake-shared-memory.ts";
import { entryText } from "../../../support/fixtures/memory-entries.ts";

export const layout = memoryLayout(".orkeon/memory");
export const memory = { layout, collection: "memory-shop" };
export const clock = new FakeClock().now;

/** The files holding each of `candidates` as a candidate file, an empty index, and the use case's dependencies. */
export function world(...candidates: MemoryEntry[]) {
  const files = new LiveListingFiles();
  for (const c of candidates) files.files.set(`${layout.candidates}/${c.id}.md`, entryText({ ...c, status: "candidate" }));
  const index = new FakeSharedMemory();
  return { files, index, deps: { files, memory: index, clock } };
}

/** The confirmation of `id` as the command sends it: the sha1 of the candidate file as it is now. */
export const yes = (files: LiveListingFiles, id: string) => ({ id, sha1: sha1Hex(files.files.get(`${layout.candidates}/${id}.md`) ?? "") });

/** The crew's input: a valid admission, its duplicate, a bad id, one without sha1 and a bare string. */
export const SHA1 = "a".repeat(40);
export const RAW_ADMIT = { admit: [{ id: "a-b", sha1: SHA1 }, { id: "a-b", sha1: SHA1 }, { id: "Bad Id", sha1: SHA1 }, { id: "c-d" }, "e-f"] };
