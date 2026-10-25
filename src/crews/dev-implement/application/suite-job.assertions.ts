// Checks on what the suite job returns and writes.
import { ok, strictEqual } from "node:assert";
import type { SuiteOutcome } from "./suite-job.ts";

/** `outcome` passed, and its tail shows `lines` lines. */
export function assertPassedTail(outcome: SuiteOutcome, lines: number): void {
  strictEqual(outcome.status, "passed", `the suite is ${outcome.status}, not passed`);
  if (outcome.status !== "passed") return;
  strictEqual(outcome.tail.split("\n").length, lines, `the tail shows ${outcome.tail.split("\n").length} lines, not ${lines}`);
}

/** The log written mentions `mention` and ends with `end`. */
export function assertSuiteLog(log: string, mention: string, end: string): void {
  ok(log.includes(mention), `the log does not mention "${mention}": ${log}`);
  ok(log.endsWith(end), `the log does not end with ${JSON.stringify(end)}: ${log}`);
}

/** `outcome` is still running and its text ends with `exit=124`, never read as green. */
export function assertRunningUnread(outcome: SuiteOutcome): void {
  ok(outcome.status === "running" && outcome.text.trimEnd().endsWith("exit=124"), outcome.status === "running" ? outcome.text : outcome.status);
}
