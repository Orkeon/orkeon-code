// /memory <list|add|delete|get> ... — typed memory CRUD (SPEC §5.2).
//   /memory list [category]   /memory add <category> <content...>
//   /memory delete <id>       /memory get <id>

import type { MemoryStore } from "../../shared/application/ports.ts";
import { parseMemoryArgs } from "./args.ts";
import type { CommandView } from "./view.ts";

export interface MemoryDeps {
  memory: MemoryStore;
}

/** `/memory [list|add|delete|get] …`, from the command's raw tokens. */
export async function runMemory(tokens: string[], deps: MemoryDeps): Promise<CommandView> {
  const { memory } = deps;
  const parsed = parseMemoryArgs(tokens);

  if (parsed.sub === "add") {
    if (!parsed.content) return { text: "usage: /memory add <category> <content>" };
    return { text: "added memory #" + (await memory.add(parsed.category, parsed.content)) };
  }
  if (parsed.sub === "delete") {
    return { text: (await memory.remove(parsed.id)) ? "deleted #" + parsed.id : "not found: #" + parsed.id };
  }
  if (parsed.sub === "get") {
    return { text: JSON.stringify((await memory.get(parsed.id)) ?? "not found") };
  }

  // list
  const entries = await memory.list(parsed.category);
  if (entries.length === 0) return { text: "(no memories)" };
  return { table: entries.map((e) => ({ id: e.id, category: e.category, content: e.content })) };
}
