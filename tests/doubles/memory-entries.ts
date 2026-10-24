// Sample shared-memory entries for the tests of the memory's use cases, tools and command: a valid
// entry of each type, and its file text.
import type { EntryType, MemoryEntry } from "../../src/shared/domain/shared-memory/entry.ts";
import { serializeEntry } from "../../src/shared/domain/shared-memory/front-matter.ts";

export const ENTRY_BODY = "## Context\nA sentence of context.\n\n## Content\nThe rule itself.\n\n## Evidence\n`src/app/main.ts:10`\n";

export function sampleEntry(type: EntryType, slug: string, over: Partial<MemoryEntry> = {}): MemoryEntry {
  const project = over.project ?? "shop";
  const date = over.date ?? "2026-10-22";
  const entry: MemoryEntry = {
    id: `${project}-${type}-${date.replace(/-/g, "")}-${slug}`, type, title: `Title of ${slug}`, project, date,
    topic: slug, appliesWhen: "a module does the thing", rationale: "it went wrong before",
    source: type === "mistake" || type === "code-structure" ? "audit:workbench/shop/SHOP-VERIFY-F1.md" : "human:2026-10-22 /memory-admit",
    status: "admitted", supersedes: [], tags: ["testing"], stack: ["typescript"], body: ENTRY_BODY,
  };
  if (type === "mistake") {
    entry.correction = "do the other thing";
    entry.detectionSignal = "a red test on the edge case";
  }
  return { ...entry, ...over, id: over.id ?? entry.id };
}

export const entryText = (entry: MemoryEntry): string => serializeEntry(entry);
