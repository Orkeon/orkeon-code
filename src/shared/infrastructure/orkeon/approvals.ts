// PendingApprovals adapter over orkeon-repl's `approvals` service (Orkeon #198). Like the
// permissions service, it is reached through the command context the runtime hands each
// command (`ctx.services`), so the adapter takes the context's service locator rather than
// being bound in wiring.ts. A host that does not register the service has no approval to show.

import type { PendingApproval, PendingApprovals } from "../../application/ports.ts";
import type { PendingApprovals as HostApprovals, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The service name; orkeon-repl registers it when it watches the tool approvals. */
const APPROVALS = "approvals";

export function createPendingApprovals(services: Pick<ServiceLocator, "get" | "has">): PendingApprovals {
  return {
    list(): PendingApproval[] {
      if (!services.has(APPROVALS)) return [];
      return services.get<HostApprovals>(APPROVALS).list().map((a) => ({
        taskId: a.taskId ?? null,
        command: a.command ?? null,
        tool: String(a.tool),
        input: String(a.input ?? ""),
      }));
    },
  };
}
