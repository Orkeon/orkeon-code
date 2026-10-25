// FakePermissionRulesFacade: orkeon-repl's `permissions` service, to test the
// PermissionRules adapter. Every call lands in `calls` with the arguments it was
// given, as given (a missing argument is absent, not undefined); `lines` is what
// list() answers.
import type { PermissionRulesFacade } from "../../../src/commands/.orkeon/orkeon-cli.d.ts";

export class FakePermissionRulesFacade implements PermissionRulesFacade {
  calls: unknown[][] = [];
  lines: string[] = [];
  /** What the host says of its gate; a test sets it to the case it exercises. */
  enabled = true;

  allow(...args: [tool: string, argument?: string, pattern?: string]): void {
    this.calls.push(["allow", ...args]);
  }

  deny(...args: [tool: string, argument?: string, pattern?: string]): void {
    this.calls.push(["deny", ...args]);
  }

  clear(): void {
    this.calls.push(["clear"]);
  }

  list(): readonly string[] {
    return this.lines;
  }
}
