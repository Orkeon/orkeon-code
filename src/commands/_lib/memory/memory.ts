// /memory <list|add|delete|get|admit> ... — typed memory CRUD (SPEC §5.2), and the shared memory's gate.
//   /memory list [category]   /memory add <category> <content...>
//   /memory delete <id>       /memory get <id>
//   /memory admit [<id>…] | --refuse <id> [motif] | --list | --import   (memory-admit.ts)
// Two aliases keep their own shape: /feedback <text> adds a 'feedback' memory, the agent replays it on every
// /assistant turn; /memory-admit's tokens are the admit arguments.

import type { MemoryStore } from "../../../shared/application/ports.ts";
import { parseMemoryArgs } from "../args.ts";
import type { CommandView } from "../view.ts";

export interface MemoryDeps {
  memory: MemoryStore;
}

/** The admit arguments of a line typed `/memory admit …` or `/memory-admit …`; null when the line is not an admission. */
export function admitTokens(tokens: readonly string[], typed: string): string[] | null {
  if (typed === "memory-admit") return [...tokens];
  if (typed === "memory" && (tokens[0] ?? "").toLowerCase() === "admit") return tokens.slice(1);
  return null;
}

/** `/feedback <text>`: a 'feedback' memory, the reply saying the agent replays it. */
async function runFeedback(tokens: string[], deps: MemoryDeps): Promise<CommandView> {
  if (tokens.join(" ").trim() === "") return { text: "usage: /feedback <what should change or keep happening>" };
  await runMemory(["add", "feedback", ...tokens], deps);
  return { text: "feedback recorded — the agent replays feedback memories on every /assistant turn." };
}

/** `/memory [list|add|delete|get] …`, from the command's raw tokens; typed by its alias `feedback`, an add of a feedback. */
export async function runMemory(tokens: string[], deps: MemoryDeps, typed = "memory"): Promise<CommandView> {
  if (typed === "feedback") return runFeedback(tokens, deps);
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
