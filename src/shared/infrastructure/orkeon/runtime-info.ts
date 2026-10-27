// RuntimeInfoReader adapter over the command context's `runtime` service (Orkeon #225): the
// release with its build metadata removed, the commit that metadata carried, the install channel.
// Like the provider's name, it is reached through the service locator each command receives,
// so the adapter takes it as a parameter. Jint keeps the CLR member names on a host object, so
// both casings are read.

import type { RuntimeInfo, RuntimeInfoReader } from "../../application/ports.ts";
import type { RuntimeInfo as HostRuntimeInfo, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { pick } from "./tool-results.ts";

/** The service name; always registered by orkeon-repl, a bare host answers its entry assembly. */
const RUNTIME = "runtime";

export function createRuntimeInfo(services: Pick<ServiceLocator, "get" | "has">): RuntimeInfoReader {
  return {
    read(): RuntimeInfo | undefined {
      try {
        if (!services.has(RUNTIME)) return undefined;
        const info = services.get<HostRuntimeInfo>(RUNTIME);
        const version = String(pick(info, "version", "Version") ?? "").trim();
        if (version.length === 0) return undefined;
        const commit = pick(info, "commit", "Commit");
        const channel = String(pick(info, "channel", "Channel") ?? "").trim();
        return { version, commit: commit == null ? null : String(commit), channel: channel || "unknown" };
      } catch {
        return undefined;
      }
    },
  };
}
