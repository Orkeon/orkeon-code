// Checks on the rules a step or a role holds.
import { ok, strictEqual } from "node:assert";
import { ruleDecision } from "../agent-policy/permission.ts";
import type { PermissionRule, RuleEffect } from "../agent-policy/permission.ts";

/** Each tool called with `args` gets `expected` from `rules`. */
export function assertDecisions(
  rules: readonly PermissionRule[], tools: readonly string[], args: Readonly<Record<string, unknown>>, expected: RuleEffect | undefined,
): void {
  for (const tool of tools) strictEqual(ruleDecision(rules, tool, args), expected, tool);
}

/** `line` opens on `start` and closes on `end`. */
export function assertFramedBy(line: string, start: string, end: string): void {
  ok(line.endsWith(end), line);
  ok(line.startsWith(start), line);
}
