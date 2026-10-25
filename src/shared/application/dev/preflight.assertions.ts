// Checks on the lines the preflight writes.
import { ok, strictEqual } from "node:assert";

/** Some line of `lines` starts with `prefix` and, when given, mentions `mention`. */
export function assertLineStarting(lines: readonly string[], prefix: string, mention = ""): void {
  ok(lines.some((l) => l.startsWith(prefix) && l.includes(mention)),
    `no line starts with "${prefix}"${mention ? ` and mentions "${mention}"` : ""}:\n${lines.join("\n")}`);
}

/** Exactly `count` lines of `lines` start with `prefix`. */
export function assertLinesStarting(lines: readonly string[], prefix: string, count: number): void {
  strictEqual(lines.filter((l) => l.startsWith(prefix)).length, count, `not ${count} lines starting with "${prefix}":\n${lines.join("\n")}`);
}
