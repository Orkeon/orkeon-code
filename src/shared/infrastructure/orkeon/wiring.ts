// The adapters bound to the runtime's `tools` global, and the session and config
// services built over them, for the entry points to wire into the application
// (the commands' _lib takes them as parameters). The only module of this folder
// that imports globals.ts:
// the adapters themselves take the tools as a parameter, so their tests run them
// over tests/support/fake-tools.ts. The CrewHost adapter (crew-host.ts) is not
// here: it reads the command context, which each command receives, not a global;
// nor are the Llm (llm.ts) and RunState (run-state.ts) adapters, which read the
// context each agent body receives. The tool catalogue reads both: the `tools`
// global for the calls, the context's `tools` service for the registered names.

import type {
  CodeIndex, Files, MemoryStore, Progress, SessionStore, Shell, Telemetry, ToolCatalogue,
} from "../../application/ports.ts";
import { createConfigStore } from "../../application/config-store.ts";
import type { ConfigStore } from "../../application/config-store.ts";
import { createSessionIo } from "../../application/session-io.ts";
import type { SessionIo } from "../../application/session-io.ts";
import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { Tools } from "../globals.ts";
import { createCodeIndex } from "./code-index.ts";
import { createFiles } from "./files.ts";
import { createMemoryStore } from "./memory-store.ts";
import { createProgress } from "./progress.ts";
import { createSessionStore } from "./session-store.ts";
import { createShell } from "./shell.ts";
import { createTelemetry } from "./telemetry.ts";
import { createToolCalls, createToolCatalogue } from "./tool-catalogue.ts";

export const orkeonShell = (): Shell => createShell(Tools);
export const orkeonFiles = (): Files => createFiles(Tools);
export const orkeonProgress = (): Progress => createProgress(Tools);
export const orkeonTelemetry = (): Telemetry => createTelemetry(Tools);
export const orkeonMemoryStore = (): MemoryStore => createMemoryStore(Tools);
export const orkeonCodeIndex = (): CodeIndex => createCodeIndex(Tools);
/** The registered tools: built in a handler, from the `ctx.services` it receives. */
export const orkeonToolCatalogue = (services: Pick<ServiceLocator, "get">): ToolCatalogue =>
  createToolCatalogue(Tools, services);

/** The calls alone, by registered name: for a crew, which gets no `tools` service. */
export const orkeonToolCalls = (): Pick<ToolCatalogue, "call"> => createToolCalls(Tools);
const orkeonSessionStore = (): SessionStore => createSessionStore(Tools);

/** The /config store: the settings file, overridden by the session bag. */
export const orkeonConfigStore = (): ConfigStore =>
  createConfigStore({ files: orkeonFiles(), session: orkeonSessionStore() });

/** The session's buffer, state and budget, and its permission mode. */
export const orkeonSessionIo = (): SessionIo =>
  createSessionIo({ store: orkeonSessionStore(), config: orkeonConfigStore() });
