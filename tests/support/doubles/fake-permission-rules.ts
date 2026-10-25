// FakePermissionRules: the PermissionRules port. `rules` is what the gate holds
// (a rule already held is kept once, as the host does); every call lands in
// `calls` ("clear", "add deny file_write"), in order, spelt as the host lists
// rules. `kept = false` plays a host that keeps no session rules: available()
// answers false and the other calls throw. `hostGate` is what the host says of
// its gate: on, off, or undefined when it cannot tell (a runtime before Orkeon #128).
import type { PermissionRules } from "../../../src/shared/application/ports.ts";
import { gateLine, sameCalls } from "../../../src/shared/domain/agent-policy/permission.ts";
import type { PermissionRule } from "../../../src/shared/domain/agent-policy/permission.ts";

export class FakePermissionRules implements PermissionRules {
  kept = true;
  hostGate: boolean | undefined = true;
  rules: PermissionRule[] = [];
  calls: string[] = [];

  check(): void {
    if (!this.kept) throw new Error("service 'permissions' is not registered");
  }

  available(): boolean {
    return this.kept;
  }

  enabled(): boolean | undefined {
    return this.kept ? this.hostGate : undefined;
  }

  add(rule: PermissionRule): void {
    this.check();
    this.calls.push(`add ${gateLine(rule)}`);
    if (!this.rules.some((r) => r.effect === rule.effect && sameCalls(r, rule))) this.rules.push(rule);
  }

  clear(): void {
    this.check();
    this.calls.push("clear");
    this.rules = [];
  }

  list(): string[] {
    this.check();
    return this.rules.map(gateLine);
  }
}
