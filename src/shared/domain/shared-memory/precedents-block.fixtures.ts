// The recalled precedents the "## Precedents" block is tested on.
import type { Precedent } from "./precedents-block.ts";
import type { EntryType, MemoryEntry } from "./entry.ts";
import { WORKSPACE } from "../dev/path-rebase.ts";

// tests/doubles/memory-entries.ts's sampleEntry, here because a domain test imports the domain only.
const ENTRY_BODY = "## Context\nA sentence of context.\n\n## Content\nThe rule itself.\n\n## Evidence\n`src/app/main.ts:10`\n";

/** A valid admitted entry of `type` named by `slug`, of project shop on 2026-10-22, its fields overridable. */
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

/** `entry` recalled from its file under /workspace/m/entries with `score`. */
export const p = (entry: Precedent["entry"], score: number): Precedent =>
  ({ entry, path: `${WORKSPACE}/m/entries/${entry.type}/${entry.id}.md`, score });

/** The pinned markers of the five rules the block's intro carries. */
export const PINNED_MARKERS: readonly string[] = [
  "precedents from other work, not rules", "name the precedent you follow or set aside", "projects disagree", "a signal to check",
];

/** Eight methods m0 to m7, the higher the number the better the score. */
export const EIGHT_METHODS: readonly Precedent[] = Array.from({ length: 8 }, (_, i) => p(sampleEntry("method", `m${i}`), i / 10));

/** Five methods with a rationale of 1 500 characters each. */
export const FIVE_LONG_METHODS: readonly Precedent[] = Array.from({ length: 5 }, (_, i) =>
  p(sampleEntry("method", `l${i}`, { rationale: "x".repeat(1_500) }), 1 - i / 10));

/** The topic money decided by shop (older, best score) and by billing (newer), then five other methods. */
export const DISAGREEING_PROJECTS: readonly Precedent[] = [
  p(sampleEntry("decision", "money", { project: "shop", date: "2026-09-01" }), 0.9),
  p(sampleEntry("decision", "money", { project: "billing", date: "2026-10-12" }), 0.2),
  ...Array.from({ length: 5 }, (_, i) => p(sampleEntry("method", `o${i}`), 0.5)),
];
