// Checks on what /dev-learn's decisions wrote.
import { deepStrictEqual, ok } from "node:assert";

import { parseRefused } from "../../domain/shared-memory/refused.ts";
import type { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";

/** refused.md at `path` lists exactly `topics`, in order. */
export function assertRefusedTopics(files: FakeFiles, path: string, topics: readonly string[]): void {
  const text = files.files.get(path);
  ok(text !== undefined, `nothing written at ${path}`);
  deepStrictEqual(parseRefused(text).motifs.map((m) => m.topic), topics, `not the refused topics expected:\n${text}`);
}

/** `lines` holds exactly one state line, and it is the last. */
export function assertOneStateLineLast(lines: readonly string[]): void {
  const states = lines.filter((l) => l.startsWith("state: "));
  deepStrictEqual(states.length, 1, `not one state line:\n${lines.join("\n")}`);
  ok(lines.at(-1)?.startsWith("state: "), `the state line is not the last:\n${lines.join("\n")}`);
}
