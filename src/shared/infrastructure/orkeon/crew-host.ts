// CrewHost adapter over the runtime's script-host service. The service is reached
// through the command context the runtime hands each command (`ctx.services`),
// not through a global, so the adapter takes the context's service locator as a
// parameter rather than being bound in wiring.ts.

import type { CrewHost } from "../../application/ports.ts";
import type { ScriptHostFacade, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";

/** The service name; the host registers it only when it can run crews. */
const SCRIPT_HOST = "script-host";

export function createCrewHost(services: Pick<ServiceLocator, "get">): CrewHost {
  const host = () => services.get<ScriptHostFacade | null | undefined>(SCRIPT_HOST);
  return {
    listCrews() {
      try {
        return [...(host()?.listCrews?.() ?? [])];
      } catch {
        return [];
      }
    },
    launch(name, input) {
      return host()!.runCrewAsync(name, input);
    },
  };
}
