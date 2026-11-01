// Checks on the owner lines a re-ask shows.
import { ok, strictEqual } from "node:assert";

import { MAX_OWNER_LINE_CHARS, MAX_OWNER_LINES_PER_MOTIF } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";
import type { OwnerLinesBlock } from "../../../../src/crews/dev-learn/domain/owner-lines.ts";

/** The block shows MAX_OWNER_LINES_PER_MOTIF lines, the first ones, each `<path>:<n>: ` and at most MAX_OWNER_LINE_CHARS. */
export function assertLinesCut(block: OwnerLinesBlock | null, path: string): void {
  ok(block !== null, "a block of owner lines");
  strictEqual(block.lines.length, MAX_OWNER_LINES_PER_MOTIF, "lines shown");
  block.lines.forEach((line, i) => {
    const head = `${path}:${i + 1}: `;
    ok(line.startsWith(head), `${JSON.stringify(line.slice(0, 30))} does not start with ${head}`);
    strictEqual(Array.from(line.slice(head.length)).length, MAX_OWNER_LINE_CHARS, `line ${i + 1} cut`);
  });
}
