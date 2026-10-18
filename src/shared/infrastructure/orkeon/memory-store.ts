// MemoryStore adapter over memory_store, its results read whatever their casing
// (`entries` or `Entries`, `id` or `Id`, `content` or `Content`...).

import type { MemoryStore } from "../../application/ports.ts";
import { pick } from "./tool-results.ts";

/** A reported number; null and absent both read as unreported. */
const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
/** A reported string; null and absent both read as unreported. */
const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

export function createMemoryStore(tools: Pick<OrkeonTools, "memoryStore">): MemoryStore {
  return {
    async list(category) {
      const resp = await tools.memoryStore({ operation: "list", category });
      const entries: any[] = pick(resp, "entries", "Entries") ?? [];
      return entries.map((e) => ({
        id: num(pick(e, "id", "Id")),
        category: str(pick(e, "category", "Category")),
        content: String(pick(e, "content", "Content") ?? ""),
      }));
    },
    async add(category, content) {
      return String(pick(await tools.memoryStore({ operation: "add", category, content }), "id", "Id"));
    },
    async get(id) {
      return pick(await tools.memoryStore({ operation: "get", id }), "entry", "Entry", "error");
    },
    async remove(id) {
      return Boolean(pick(await tools.memoryStore({ operation: "delete", id }), "success", "Success"));
    },
  };
}
