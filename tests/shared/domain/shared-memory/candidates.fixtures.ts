// The entries the candidates list and the index are tested on.
import type { EntryType, MemoryEntry } from "../../../../src/shared/domain/shared-memory/entry.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

// tests/support/fixtures/memory-entries.ts's sampleEntry, here because a domain test imports the domain only.
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

/** A method candidate whose source holds a pipe, then a mistake candidate two audits back: given out of id order. */
export const METHOD_THEN_MISTAKE: readonly MemoryEntry[] = [
  sampleEntry("method", "beta", { status: "candidate", source: "human:2026-10-22 a | b" }),
  sampleEntry("mistake", "alpha", { status: "candidate", source: "audit:x/X-VERIFY-F1.md, y/Y-VERIFY-F2.md" }),
];

export interface BatchesCase {
  name: string;
  source: string;
  batches: string;
}

export const BATCHES_OF: readonly BatchesCase[] = [
  { name: "an audit naming one batch twice and another once counts two", source: "audit:x/X-VERIFY-F1.md, x/X-VERIFY-F1.md, x/X-VERIFY-F3.md", batches: "2" },
  { name: "a human's source counts none", source: "human:2026-10-22 memory_push", batches: "-" },
];

/** An admitted decision and a superseded method. */
export const DECISION_AND_SUPERSEDED_METHOD: readonly MemoryEntry[] = [
  sampleEntry("decision", "b"), sampleEntry("method", "a", { status: "superseded", supersededBy: "x" }),
];

export interface PointerCase {
  name: string;
  status: "admitted" | "refused";
  file?: string;
  /** What the pointer names. */
  names: string;
}

export const POINTERS: readonly PointerCase[] = [
  { name: "an admitted candidate points to its entry file", status: "admitted", file: `${WORKSPACE}/m/entries/method/x.md`, names: "entries/method/x.md" },
  { name: "a refused candidate points to refused.md", status: "refused", names: "refused.md" },
];

export const POINTERS_PARSED: readonly Omit<PointerCase, "names">[] = [
  { name: "admitted", status: "admitted", file: "f" },
  { name: "refused", status: "refused" },
];
