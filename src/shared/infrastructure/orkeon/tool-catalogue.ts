// ToolCatalogue adapter. The names are the registered ones, read from the host's
// `tools` service (ctx.services.get("tools"): the registered tools, each with its
// `Name`), and matched case-insensitively, as Orkeon matches an agent's
// `.tools([...])`. The calls go through the runtime's `tools` namespace, which
// exposes each tool as a camelCase member (file_read → tools.fileRead): a member
// cannot give the registered name back (`get-file-contents`, `get_file_contents`
// and `getFileContents` are all `getFileContents`). A result is passed through raw:
// /debug-tool-call exists to show it as the tool returned it.

import type { ToolCatalogue } from "../../application/ports.ts";
import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { asArray, pick } from "./tool-results.ts";

/** The service that hands out the registered tools. */
const TOOLS = "tools";

/**
 * `file_read` → `fileRead`: the tools namespace exposes camelCase members, built
 * as the runtime builds them (ToolsNamespaceBinding.ToCamelCase): `_` and `-` are
 * dropped and raise the next letter, the first letter is lowered — so an MCP
 * server's `search-issues` is `searchIssues` too.
 */
export function toolMemberName(name: string): string {
  let member = "";
  let raise = false;
  for (const c of name) {
    if (c === "_" || c === "-") {
      raise = member.length > 0;
      continue;
    }
    member += raise ? c.toUpperCase() : c;
    raise = false;
  }
  return member.charAt(0).toLowerCase() + member.slice(1);
}

/** The names of the tools the service hands out (IBaseTool[], each with its `Name`). */
function registeredNames(services: Pick<ServiceLocator, "get">): string[] {
  return asArray(services.get<unknown>(TOOLS))
    .map((tool) => String(pick(tool, "Name", "name") ?? ""))
    .filter((name) => name.length > 0);
}

/**
 * The calls alone, by registered name, through the tools namespace: what a crew
 * gets, since it has no `tools` service to list the names. The launching command
 * found the registered name already (a ToolCatalogue's `find`).
 */
export function createToolCalls(tools: object): Pick<ToolCatalogue, "call"> {
  return {
    async call(name, args) {
      const fn = (tools as Record<string, unknown> | undefined)?.[toolMemberName(name)];
      if (typeof fn !== "function") throw new Error(`no registered tool '${name}'`);
      return (fn as (input: Record<string, unknown>) => unknown)(args);
    },
  };
}

export function createToolCatalogue(tools: object, services: Pick<ServiceLocator, "get">): ToolCatalogue {
  const find = (name: string): string | undefined => {
    const wanted = name.toLowerCase();
    return registeredNames(services).find((registered) => registered.toLowerCase() === wanted);
  };
  return {
    names: () => registeredNames(services).sort(),
    find,
    async call(name, args) {
      const registered = find(name);
      if (registered === undefined) throw new Error(`no registered tool '${name}'`);
      return createToolCalls(tools).call(registered, args);
    },
  };
}
