// Checks on the rules launchMainLoop hands the host gate.
import { strictEqual } from "node:assert";
import { ruleDecision } from "../src/shared/domain/agent-policy/permission.ts";
import { PATH_WRITE_TOOLS } from "../src/shared/domain/agent-policy/rule-sets.ts";

/**
 * The gate denies every path-writing tool a write under `paths` (the memory's candidates and entries), and still allows
 * file_write on the memory's refused.md; `label` names the mode in the messages.
 */
export function assertMemoryGuarded(rules: Parameters<typeof ruleDecision>[0], paths: readonly string[], label: string): void {
  for (const tool of PATH_WRITE_TOOLS) {
    for (const path of paths) {
      strictEqual(ruleDecision(rules, tool, { path, content: "status: admitted" }), "deny", `${label} ${tool} ${path} is not denied`);
    }
  }
  strictEqual(ruleDecision(rules, "file_write", { path: ".orkeon/memory/refused.md" }), "allow", `${label}: refused.md is not allowed`);
}
