// The extra tools the main agent may use (the `tools.extra` setting), read from
// /config and checked against the tools the host registers. A tool whose MCP
// server did not connect, whose plugin did not load, or whose name is mistyped is
// left out of the catalogue: Orkeon fails the act call of an agent that names a
// tool the host does not register (UnknownToolError). A setting that cannot be read
// configures no tool and says why: the callers report it, and the stored rules on
// extra tools stay as written, dormant (permission-rules.ts).

import type { ToolCatalogue } from "./ports.ts";
import { CONFIG_FILE_PATH } from "./config-store.ts";
import type { ConfigStore } from "./config-store.ts";
import { EXTRA_TOOLS_CONFIG_KEY, parseExtraTools } from "../domain/agent-policy/extra-tools.ts";
import type { ExtraToolsParse } from "../domain/agent-policy/extra-tools.ts";
import type { ExtraTool } from "../domain/agent-policy/permission.ts";

/** The setting as read: its entries, or why it could not be read. */
export interface ExtraToolsRead extends ExtraToolsParse {
  /** Why the setting could not be read; it then configures no tool, which the caller reports. */
  unreadable?: string;
}

/** The configured extra tools; an unreadable setting configures none, and says why. The
 *  config store reads a settings file it cannot read or parse as empty: an unset
 *  setting is told apart from one that file may hold. */
export async function readExtraTools(config: Pick<ConfigStore, "readValue" | "readFile">): Promise<ExtraToolsRead> {
  try {
    const { value, source } = await config.readValue(EXTRA_TOOLS_CONFIG_KEY);
    if (source === "unset" && (await config.readFile()).malformed) {
      return { tools: [], invalid: [], unreadable: `${CONFIG_FILE_PATH} could not be read or parsed` };
    }
    return parseExtraTools(value);
  } catch (e: unknown) {
    return { tools: [], invalid: [], unreadable: String((e as { message?: unknown })?.message ?? e) };
  }
}

export interface ExtraToolsResolution {
  /** Configured and registered, each under the name the host registers it by
   *  (found case-insensitively, as Orkeon finds it): what the catalogue may offer. */
  present: ExtraTool[];
  /** Configured, but no tool of the host answers to the name. */
  missing: ExtraTool[];
  /** Entries of the setting that do not parse, as written. */
  invalid: string[];
  /** Why the setting could not be read, when it could not: no extra tool is configured. */
  unreadable?: string;
}

/** The configured extra tools, split by whether the host registers them. A
 *  registered one takes the registered name: the catalogue offers it, and the rules
 *  name it, as the host spells it. */
export async function resolveExtraTools(deps: {
  config: Pick<ConfigStore, "readValue" | "readFile">;
  catalogue: Pick<ToolCatalogue, "find">;
}): Promise<ExtraToolsResolution> {
  const { tools, invalid, unreadable } = await readExtraTools(deps.config);
  const present: ExtraTool[] = [];
  const missing: ExtraTool[] = [];
  for (const tool of tools) {
    const registered = deps.catalogue.find(tool.name);
    if (registered === undefined) missing.push(tool);
    else present.push({ ...tool, name: registered });
  }
  return { present, missing, invalid, ...(unreadable === undefined ? {} : { unreadable }) };
}

/** Every configured name, registered or not: the names a permission rule may use. */
export function configuredNames(extras: Pick<ExtraToolsResolution, "present" | "missing">): string[] {
  return [...extras.present, ...extras.missing].map((t) => t.name);
}
