// Checks on the tool catalogues, the notes and the rules the permission policy hands out.
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { READ_TOOLS } from "../../../../src/shared/domain/agent-policy/permission.ts";
import type { CatalogueDecision, PermissionRule, RuleCheck } from "../../../../src/shared/domain/agent-policy/permission.ts";

/** Each of `names` is in `toolset` when `offered`, absent from it otherwise. */
export function assertOffered(toolset: readonly string[], names: readonly string[], offered: boolean, label: string): void {
  for (const name of names) {
    strictEqual(toolset.includes(name), offered, `${label} / ${name} should ${offered ? "" : "not "}be offered`);
  }
}

/** `toolset` is a read-only mode's: no file_write, no shell_command, every local read. */
export function assertReadOnlyToolset(toolset: readonly string[], label: string): void {
  assertOffered(toolset, ["file_write", "shell_command"], false, label);
  assertOffered(toolset, READ_TOOLS, true, label);
}

/** Every inert rule of `decision` is reported with a reason that starts with `prefix` and says to switch mode. */
export function assertInertReasons(decision: CatalogueDecision, prefix: string): void {
  for (const r of decision.inert) {
    ok(r.reason.startsWith(prefix), r.reason);
    ok(r.reason.includes("Switch mode"), r.reason);
  }
}

/** The arguments of every tool of `toolArguments` but the `own` ones are those orkeon.d.ts `declared`, order aside. */
export function assertArgumentsDeclared(
  toolArguments: Readonly<Record<string, readonly string[]>>, declared: Map<string, string[]>, own: (tool: string) => boolean,
): void {
  for (const [tool, args] of Object.entries(toolArguments)) {
    if (own(tool)) continue;
    ok(declared.has(tool), `${tool} is not declared in OrkeonBuiltInTools`);
    deepStrictEqual([...args].sort(), [...declared.get(tool)!].sort(), tool);
  }
}

/** Every tool of `toolArguments` names its arguments once each, in snake_case. */
export function assertWellFormedArguments(toolArguments: Readonly<Record<string, readonly string[]>>): void {
  for (const [tool, args] of Object.entries(toolArguments)) {
    strictEqual(new Set(args).size, args.length, `${tool} names an argument twice`);
    for (const arg of args) ok(/^[a-z][a-z0-9_]*$/.test(arg), `${tool}.${arg} is snake_case`);
  }
}

/** `check` accepts `rule`, with a warning that starts with `prefix` and mentions `mention`. */
export function assertAcceptedWithWarning(check: RuleCheck, rule: PermissionRule, prefix: string, mention: string): void {
  strictEqual(check.ok, true, "the rule should be accepted");
  if (!check.ok) return;
  deepStrictEqual(check.rule, rule);
  ok(check.warning?.startsWith(prefix), check.warning);
  ok(check.warning?.includes(mention), check.warning);
}
