// Pre-compaction memory extraction (F3.4): the model lists the durable facts of
// the conversation, and each one goes to the typed-memory store, so that nothing
// worth keeping is lost to the summary.

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
  memory: Pick<MemoryStore, "add">,
  transcript: string,
): Promise<ExtractedMemory[]> {
  try {
    const raw = await llm.extract(buildMemoryExtractionPrompt(transcript), MEMORY_EXTRACTION_SCHEMA);
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
