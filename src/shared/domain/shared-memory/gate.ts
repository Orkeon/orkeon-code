// The write gate of the shared memory, pure (temp/05 § 3): which source may admit which type,
// when an admission is confirmed by the operator, and the recurrence a harvested mistake needs.

import { ENTRY_TYPES } from "./entry.ts";
import type { EntryType, MemoryEntry } from "./entry.ts";
import { MIN_MOTIF_BATCHES } from "./verdict-rows.ts";

export type SourceKind = "verdict" | "audit" | "human";

/** human: the operator decided, any type; audit: a verdict backs a structure or a mistake; verdict: a human stop
 *  of the dev workflow already passed, for a method or a decision. */
export const ADMITTED_TYPES_BY_SOURCE: Readonly<Record<SourceKind, readonly EntryType[]>> = {
  human: ENTRY_TYPES,
  audit: ["code-structure", "mistake"],
  verdict: ["method", "decision"],
};

/** A mistake is harvested from audit rows only when it recurs in this many distinct batches. */
export const MISTAKE_MIN_BATCHES = MIN_MOTIF_BATCHES;

export function sourceKind(source: string): SourceKind | undefined {
  const m = /^(verdict|audit|human):\S/.exec(source);
  return m === null ? undefined : (m[1] as SourceKind);
}

/** Why the entry's source cannot admit its type; undefined when it can. */
export function admissionProblem(entry: Pick<MemoryEntry, "type" | "source">): string | undefined {
  const kind = sourceKind(entry.source);
  if (kind === undefined) return "its source is not verdict:, audit: or human:";
  const types = ADMITTED_TYPES_BY_SOURCE[kind];
  return types.includes(entry.type) ? undefined : `${kind === "audit" ? "an" : "a"} ${kind}: source admits ${types.join(" or ")}, not ${entry.type}`;
}

/** Whether the operator confirms the admission: always, unless an audit backs it and memory.autoAdmitAudited is true. */
export function asksConfirmation(entry: Pick<MemoryEntry, "source">, autoAdmitAudited: boolean): boolean {
  return !(autoAdmitAudited && sourceKind(entry.source) === "audit");
}
