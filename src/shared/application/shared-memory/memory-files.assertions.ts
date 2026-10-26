// Checks on the files memory-files writes.
import { ok, strictEqual } from "node:assert";

import type { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";

/** `files` holds at `path` an entry of `id` with the status `status`. */
export function assertEntryWritten(files: FakeFiles, path: string, id: string, status: string): void {
  const text = files.files.get(path);
  ok(text !== undefined, `nothing written at ${path}`);
  const parsed = parseEntry(text);
  ok(parsed.ok, `the file at ${path} does not parse as an entry:\n${text}`);
  strictEqual(parsed.entry.id, id, "not the entry expected");
  strictEqual(parsed.entry.status, status, "not the status expected");
}

/** `files` holds at `path` a text that mentions `part`. */
export function assertListNames(files: FakeFiles, path: string, part: string): void {
  const text = files.files.get(path) ?? "";
  ok(text.includes(part), `${path} does not mention ${part}:\n${text}`);
}
