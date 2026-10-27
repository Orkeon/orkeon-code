// SessionSwitch adapter over the command context's `session` service (Orkeon #227): the session
// saved now, a saved one loaded in place. The service is there while orkeon-repl persists the session
// per project (Orkeon:Cli:Session:Persist, its default); a host without it leaves the reader nothing to
// hand out, and /resume says so. Reached through the service locator each command receives.

import type { SessionSwitch } from "../../application/ports.ts";
import type { SessionFacade, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The service name; orkeon-repl registers it while the session is persisted. */
const SESSION = "session";

export function createSessionSwitch(services: Pick<ServiceLocator, "get" | "has">): SessionSwitch | undefined {
  if (!services.has(SESSION)) return undefined;
  const facade = services.get<SessionFacade>(SESSION);
  return {
    async save(path?: string) {
      return String(await (path === undefined ? facade.save() : facade.save(path)));
    },
    async load(path: string) {
      return Number(await facade.load(path));
    },
  };
}
