// Pre-compaction memory extraction: the model lists the durable facts of the
// conversation, and each one goes to the typed-memory store, so that nothing worth
// keeping is lost to the summary. What the store already holds is listed in the
// prompt, so a fact is not saved twice.

import type { Llm, MemoryStore } from "../ports.ts";
import {
  buildMemoryExtractionPrompt,
  MEMORY_EXTRACTION_SCHEMA,
  sanitizeExtractedMemories,
  type ExtractedMemory,
} from "../../domain/compaction.ts";

/** Extract + persist durable memories; failures degrade to an empty list. */
export async function extractMemories(
  llm: Pick<Llm, "extract">,
  memory: Pick<MemoryStore, "add" | "list">,
  transcript: string,
): Promise<ExtractedMemory[]> {
  try {
    const known = await memory.list().then((entries) => entries.map((e) => e.content)).catch(() => [] as string[]);
    const raw = await llm.extract(buildMemoryExtractionPrompt(transcript, known), MEMORY_EXTRACTION_SCHEMA);
    const items = sanitizeExtractedMemories(raw);
    for (const it of items) {
      try {
        await memory.add(it.category, it.content);
      } catch { /* store unavailable → memory only lives in the recap message */ }
    }
    return items;
  } catch {
    return [];
  }
}
