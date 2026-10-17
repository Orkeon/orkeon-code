// PermissionRules adapter over orkeon-repl's `permissions` service
// (PermissionRulesFacade). Like the script-host, the service is reached through
// the command context the runtime hands each command (`ctx.services`), so the
// adapter takes the context's service locator as a parameter rather than being
// bound in wiring.ts.

import type { PermissionRules } from "../../application/ports.ts";
import type { PermissionRulesFacade, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The service name; orkeon-repl registers it, a host that keeps no rules does not. */
const PERMISSIONS = "permissions";

export function createPermissionRules(services: Pick<ServiceLocator, "get" | "has">): PermissionRules {
  const facade = () => services.get<PermissionRulesFacade>(PERMISSIONS);
  return {
    available() {
      return services.has(PERMISSIONS);
    },
    add(rule) {
      const rules = facade();
      // A rule over every call passes the tool alone: the facade reads an absent
      // argument as "every call".
      if (rule.argument === undefined) {
        if (rule.effect === "allow") rules.allow(rule.tool);
        else rules.deny(rule.tool);
      } else if (rule.effect === "allow") {
        rules.allow(rule.tool, rule.argument, rule.pattern);
      } else {
        rules.deny(rule.tool, rule.argument, rule.pattern);
      }
    },
    clear() {
      facade().clear();
    },
    list() {
      return [...facade().list()].map(String);
    },
  };
}
