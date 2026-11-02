// Pre-compaction memory extraction: the model lists the durable facts of the
// conversation, and each one goes to the typed-memory store, so that nothing worth
// keeping is lost to the summary. What the store already holds is listed in the
// prompt by id, the newest first (the list is capped), so a fact is not saved twice
// and a fact that makes a known entry out of date replaces it in place; today's date
// is given, so a relative date is saved as an absolute one.

import type { Llm, MemoryEntry, MemoryStore } from "../ports.ts";
import {
  buildMemoryExtractionPrompt,
  MEMORY_EXTRACTION_SCHEMA,
  sanitizeExtractedMemories,
  type ExtractedMemory,
} from "../../domain/compaction.ts";

/** Extract + persist durable memories; failures degrade to an empty list. `today` is YYYY-MM-DD. */
export async function extractMemories(
  llm: Pick<Llm, "extract">,
  memory: Pick<MemoryStore, "add" | "list" | "replace">,
  transcript: string,
  today?: string,
): Promise<ExtractedMemory[]> {
  try {
    const known = await memory.list(undefined, { newestFirst: true }).catch(() => [] as MemoryEntry[]);
    const raw = await llm.extract(buildMemoryExtractionPrompt(transcript, known, today), MEMORY_EXTRACTION_SCHEMA);
    const items = sanitizeExtractedMemories(raw, known);
    for (const it of items) {
      try {
        // A stale entry is replaced in place; a replacement the store refuses is added as a new entry.
        if (it.replaces !== undefined && await memory.replace(it.replaces, it.content).catch(() => false)) continue;
        await memory.add(it.category, it.content);
      } catch { /* store unavailable → memory only lives in the recap message */ }
    }
    return items;
  } catch {
    return [];
  }
}
