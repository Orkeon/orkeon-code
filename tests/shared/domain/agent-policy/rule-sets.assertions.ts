// Checks on the rule sets and on what they decide.
import { ok, strictEqual } from "node:assert";
import { coversEveryCall, formatRule, TOOL_ARGUMENTS } from "../../../../src/shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { UNSCOPED_WRITE_TOOLS } from "../../../../src/shared/domain/agent-policy/rule-sets.ts";

/** Each of `values` got the decision `refused`: `decisions[i]` is what the set `label` decided for `values[i]`. */
export function assertEveryDecision(
  values: readonly string[], decisions: readonly boolean[], refused: boolean, label: string,
): void {
  strictEqual(decisions.length, values.length, `${label}: ${decisions.length} decisions for ${values.length} values`);
  values.forEach((value, i) => strictEqual(decisions[i], refused, `${label}: ${value}`));
}

/** Every rule denies, and names a ruleable tool with an argument it takes - or an unscoped writer whole. */
export function assertRuleable(rules: readonly PermissionRule[]): void {
  for (const r of rules) {
    strictEqual(r.effect, "deny", `${formatRule(r)} is not a deny rule`);
    if (coversEveryCall(r)) ok(UNSCOPED_WRITE_TOOLS.includes(r.tool), `${formatRule(r)} covers every call of a scoped tool`);
    else ok(TOOL_ARGUMENTS[r.tool].includes(r.argument!), `${formatRule(r)} reads an argument its tool does not take`);
  }
}
