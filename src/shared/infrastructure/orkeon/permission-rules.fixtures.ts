// The permission gates the createPermissionRules tests drive, and the rules they add.
import { createPermissionRules } from "./permission-rules.ts";
import { FakePermissionRulesFacade } from "../../../../tests/support/fake-permissions-facade.ts";
import { FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";

type PermissionRules = ReturnType<typeof createPermissionRules>;
type Rule = Parameters<PermissionRules["add"]>[0];

/** A FakePermissionRulesFacade served as the "permissions" service, and the gate built over it. */
export function gateOverFake() {
  const facade = new FakePermissionRulesFacade();
  const services = new FakeServiceLocator();
  services.services.set("permissions", facade);
  return { facade, gate: createPermissionRules(services) };
}

/** A gate over a host that keeps no rules: its locator throws on the permissions service. */
export function gateWithoutRules(): PermissionRules {
  return createPermissionRules({
    has: () => false,
    get: () => {
      throw new Error("service 'permissions' is not registered");
    },
  });
}

export interface RuleCase {
  name: string;
  rule: Rule;
  /** The call the facade receives. */
  call: unknown[];
}

/** A whole-tool rule passes as the tool alone, a scoped rule with its argument and pattern. */
export const RULES: readonly RuleCase[] = [
  { name: "passes a whole-tool deny as the tool alone", rule: { effect: "deny", tool: "file_write" }, call: ["deny", "file_write"] },
  { name: "passes a whole-tool allow as the tool alone", rule: { effect: "allow", tool: "http_api" }, call: ["allow", "http_api"] },
  {
    name: "passes a scoped allow with its argument and pattern",
    rule: { effect: "allow", tool: "shell_command", argument: "command", pattern: "npm test*" },
    call: ["allow", "shell_command", "command", "npm test*"],
  },
  {
    name: "passes a scoped deny with its argument and pattern",
    rule: { effect: "deny", tool: "shell_command", argument: "command", pattern: "git push*" },
    call: ["deny", "shell_command", "command", "git push*"],
  },
];

export interface ChangeCase {
  name: string;
  change: (gate: PermissionRules) => void;
}

/** The changes a gate refuses when the host keeps no rules. */
export const CHANGES_WITHOUT_RULES: readonly ChangeCase[] = [
  { name: "throws on a clear when the host keeps no rules", change: (gate) => gate.clear() },
  { name: "throws on an add when the host keeps no rules", change: (gate) => gate.add({ effect: "deny", tool: "file_write" }) },
];
