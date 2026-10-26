// Checks on the problems the write gate names.
import { ok } from "node:assert";

/** `problem` is a problem, and it says `piece`. */
export function assertProblemSays(problem: string | undefined, piece: string): void {
  ok(problem !== undefined, `no problem named, expected one saying "${piece}"`);
  ok(problem.includes(piece), `the problem "${problem}" does not say "${piece}"`);
}
