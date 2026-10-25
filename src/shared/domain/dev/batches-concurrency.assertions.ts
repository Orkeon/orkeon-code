// Checks on the concurrency checks and refusals.
import { ok } from "node:assert";
import type { Concurrency } from "./batches-concurrency.ts";

/** `c` is a refusal whose line is exactly `line`. */
export function assertRefusedWith(c: Concurrency, line: string): void {
  ok(!c.ok && c.line === line, `not refused with ${JSON.stringify(line)}: ${JSON.stringify(c)}`);
}

/** `c` is a refusal whose line starts with `start`. */
export function assertRefusedStarting(c: Concurrency, start: string, label: string): void {
  ok(!c.ok && c.line.startsWith(start), `${label} is not refused with a line starting ${JSON.stringify(start)}`);
}

/** The git refusal names the confinement setting, the runtime change that lifts it and the sequential way out. */
export function assertGitRefusal(line: string): void {
  ok(line.startsWith("concurrency 2 refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode)"),
    `the line does not open on the refusal and the confinement setting: ${line}`);
  ok(line.includes("Orkeon/orkeon#191") && line.endsWith("or run with --concurrency 1"),
    `the line names no runtime change or no sequential way out: ${line}`);
}
