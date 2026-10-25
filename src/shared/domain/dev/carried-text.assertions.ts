// Checks on the blocks carriedBlocks returns.
import { ok } from "node:assert";

/** `block` is a fenced text cut short: it ends with the note saying how much is missing. */
export function assertCutBlock(block: string): void {
  ok(block.endsWith("more characters)\n```"), `not a cut block: …${block.slice(-60)}`);
}

/** The blocks together stay within `room`, give or take the cut note and the line breaks that join them. */
export function assertWithinRoom(blocks: readonly string[], room: number): void {
  const length = blocks.join("\n").length;
  ok(length <= room + 60, `the blocks take ${length} characters for a room of ${room}`);
}
