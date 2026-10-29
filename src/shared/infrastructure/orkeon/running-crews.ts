// RunningCrews adapter over the host's `commands` service (CommandsFacade). A crew launched from a command is an
// instance of that command whose `intent` is the crew's name (`targetAgent` is `crew:<name>`). Like the approvals,
// the service is reached through the command context (`ctx.services`), so the adapter takes the context's service
// locator rather than being bound in wiring.ts. A host that does not register the service runs no crew we can see.

import type { RunningCrew, RunningCrews } from "../../application/ports.ts";
import type { CommandsFacade, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The service name; the host registers it when it dispatches commands to agents. */
const COMMANDS = "commands";

export function createRunningCrews(services: Pick<ServiceLocator, "get" | "has">): RunningCrews {
  return {
    running(crew: string): RunningCrew[] {
      if (!services.has(COMMANDS)) return [];
      return services.get<CommandsFacade>(COMMANDS).list({ state: "running" })
        .filter((i) => i.intent === crew)
        .map((i) => ({ ticket: String(i.ticket) }));
    },
  };
}
