// Checks on the lines of the candidates list.
import { ok } from "node:assert";

/** `line` starts with `start` and ends with `end`. */
export function assertRow(line: string, start: string, end: string, what: string): void {
  ok(line.startsWith(start), `${what}: "${line}" does not start with "${start}"`);
  ok(line.endsWith(end), `${what}: "${line}" does not end with "${end}"`);
}
