// Recall from the shared memory: ask the index, read each hit's file, keep the admitted entries of the
// types asked, best first. The index keeps superseded entries and is no source of truth, so the status
// is read from the file itself. recallPrecedents is the best-effort form a crew step uses: a failure
// costs the block, never the step (as extract-memories.ts degrades to nothing).

import type { Files, Logger, SharedMemory } from "../ports.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import type { EntryType } from "../../domain/shared-memory/entry.ts";
import { MAX_PRECEDENTS, RECALL_TOP_N, buildPrecedentsBlock } from "../../domain/shared-memory/precedents-block.ts";
import type { Precedent } from "../../domain/shared-memory/precedents-block.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";

export interface RecallDeps {
  memory: Pick<SharedMemory, "search">;
  files: Pick<Files, "read">;
}

export interface RecallRequest {
  /** Where the entries are and the collection that indexes them (memory-settings.ts). */
  memory: { layout: Pick<MemoryLayout, "entries">; collection: string };
  query: string;
  /** Only these types; absent or empty = every type. */
  types?: readonly EntryType[];
  /** At most this many entries, MAX_PRECEDENTS at most. */
  max?: number;
}

export interface Recall {
  precedents: Precedent[];
  /** More admitted entries matched than were kept. */
  truncated: boolean;
}

/** The admitted entries the index finds for the query. Throws when the index cannot answer. */
export async function recallEntries(deps: RecallDeps, request: RecallRequest): Promise<Recall> {
  const max = Math.max(1, Math.min(MAX_PRECEDENTS, Math.floor(request.max ?? MAX_PRECEDENTS)));
  const query = request.query.trim();
  if (query === "") return { precedents: [], truncated: false };
  const hits = await deps.memory.search(request.memory.collection, query, RECALL_TOP_N);
  const under = `${request.memory.layout.entries}/`;
  const types = request.types !== undefined && request.types.length > 0 ? new Set(request.types) : null;
  const found: Precedent[] = [];
  for (const hit of hits) {
    if (!hit.sourceId.startsWith(under)) continue;
    let text: string;
    try {
      text = await deps.files.read(hit.sourceId);
    } catch {
      continue; // gone since the index was built
    }
    const parsed = parseEntry(text);
    if (!parsed.ok || parsed.entry.status !== "admitted") continue;
    if (types !== null && !types.has(parsed.entry.type)) continue;
    found.push({ entry: parsed.entry, path: hit.sourceId, score: hit.score });
  }
  return { precedents: found.slice(0, max), truncated: found.length > max };
}

/** The "## Precedents" block for a crew step's prompt; "" when nothing is recalled or the recall fails. */
export async function recallPrecedents(
  deps: RecallDeps & { log: Pick<Logger, "warn"> }, request: RecallRequest,
): Promise<string> {
  try {
    return buildPrecedentsBlock((await recallEntries(deps, request)).precedents);
  } catch (error) {
    deps.log.warn(`shared memory: recall failed, no precedents (${String((error as Error)?.message ?? error).split("\n")[0]})`);
    return "";
  }
}
