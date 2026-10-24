// admitEntries: what /memory-admit decided, applied by the crew shared-memory-admit. Per admitted
// id: the candidate re-read and re-checked (it may have been edited since it was shown), written
// to entries/<type>/<id>.md as admitted, each entry it supersedes rewritten, its candidate file
// turned into a pointer. Per refused id: its topic appended to refused.md, the pointer. Then the
// two lists and one ingestion of entries/ (prune: a superseded entry stays indexed, recall drops it
// by its status). A failed ingestion leaves the files as decided and says the index is stale.

import type { Files, SharedMemory } from "../ports.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";
import { entryProblems } from "../../domain/shared-memory/entry.ts";
import { parseEntry, serializeEntry } from "../../domain/shared-memory/front-matter.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { admissionProblem } from "../../domain/shared-memory/gate.ts";
import { decidedPointer } from "../../domain/shared-memory/candidates.ts";
import { candidatePath, entryPath } from "../../domain/shared-memory/layout.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";
import { readOrNull, refreshCandidatesList, refreshIndexFile, refusedTopics, storedEntries } from "./memory-files.ts";
import { sha1Hex } from "../../domain/sha1.ts";

export const DEFAULT_REFUSAL_MOTIF = "refused by /memory-admit";

/** One confirmed admission: the candidate's id and the sha1 of the file text the operator was shown. */
export interface Confirmed { id: string; sha1: string }

export interface AdmitDecisions {
  admit: Confirmed[];
  refuse: Array<{ id: string; motif?: string }>;
}

/** The crew's input read: the `{id, sha1}` items of `admit` with a kebab-case id and a sha1, nothing else. */
export function admittedCandidates(input: unknown): Confirmed[] {
  const admit = (input as { admit?: unknown } | null)?.admit;
  if (!Array.isArray(admit)) return [];
  const seen = new Set<string>();
  return admit.flatMap((item): Confirmed[] => {
    const { id, sha1 } = (item ?? {}) as { id?: unknown; sha1?: unknown };
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || typeof sha1 !== "string" || !/^[0-9a-f]{40}$/.test(sha1)) return [];
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, sha1 }];
  });
}

export interface AdmitDeps {
  files: Pick<Files, "read" | "write" | "list">;
  memory: Pick<SharedMemory, "ingest">;
  clock: () => Date;
}

export interface AdmitOutcome {
  admitted: string[];
  refused: string[];
  /** One line per id not applied, with the reason. */
  failed: string[];
  /** What went wrong without undoing a decision: a superseded id not found, a list not refreshed, a stale index. */
  warnings: string[];
}

const firstLine = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

/** The pending candidate `id`, or why it cannot be decided. */
async function candidate(
  files: Pick<Files, "read">, layout: MemoryLayout, id: string, sha1?: string,
): Promise<MemoryEntry | string> {
  let text: string | null;
  try {
    text = await readOrNull(files, candidatePath(layout, id));
  } catch (error) {
    return `its candidate file cannot be read (${firstLine(error)})`;
  }
  if (text === null) return "no candidate file";
  if (sha1 !== undefined && sha1Hex(text) !== sha1) return "its file changed since it was confirmed: run /memory-admit again";
  const parsed = parseEntry(text);
  if (!parsed.ok) return `its file is not a candidate entry any more (${parsed.problems[0] ?? "decided already"})`;
  if (parsed.entry.status !== "candidate") return `its status is ${parsed.entry.status}, not candidate`;
  if (parsed.entry.id !== id) return `its file holds the id ${parsed.entry.id}`;
  return parsed.entry;
}

async function admitOne(
  deps: AdmitDeps, layout: MemoryLayout, confirmed: Confirmed, today: string, outcome: AdmitOutcome,
): Promise<boolean> {
  const id = confirmed.id;
  const found = await candidate(deps.files, layout, id, confirmed.sha1);
  if (typeof found === "string") { outcome.failed.push(`${id}: ${found}`); return false; }
  let refused: Set<string>;
  try {
    refused = await refusedTopics(deps.files, layout);
  } catch (error) {
    outcome.failed.push(`${id}: ${layout.refused} cannot be read (${firstLine(error)})`);
    return false;
  }
  if (refused.has(found.topic)) { outcome.failed.push(`${id}: its topic '${found.topic}' was refused (refused.md)`); return false; }
  const entry: MemoryEntry = { ...found, status: "admitted" };
  const problems = [...entryProblems(entry), ...[admissionProblem(entry)].filter((p): p is string => p !== undefined)];
  if (problems.length > 0) { outcome.failed.push(`${id}: not admitted, ${problems.join("; ")}`); return false; }
  const target = entryPath(layout, entry.type, id);
  try {
    if ((await readOrNull(deps.files, target)) !== null) { outcome.failed.push(`${id}: ${target} exists already`); return false; }
    await deps.files.write(target, serializeEntry(entry));
  } catch (error) {
    outcome.failed.push(`${id}: ${target} not written (${firstLine(error)})`);
    return false;
  }
  outcome.admitted.push(id);
  if (entry.supersedes.length > 0) {
    const stored = await storedEntries(deps.files, layout);
    for (const old of entry.supersedes) {
      const hit = stored.find((s) => s.entry.id === old && s.entry.status === "admitted");
      if (hit === undefined) { outcome.warnings.push(`${id} supersedes ${old}, which is no admitted entry: left as it is`); continue; }
      try {
        await deps.files.write(hit.path, serializeEntry({ ...hit.entry, status: "superseded", supersededBy: id }));
      } catch (error) {
        outcome.warnings.push(`${old} not marked superseded by ${id} (${firstLine(error)})`);
      }
    }
  }
  await pointer(deps.files, layout, id, decidedPointer("admitted", today, target), outcome);
  return true;
}

async function refuseOne(
  deps: AdmitDeps, layout: MemoryLayout, decision: { id: string; motif?: string }, today: string, outcome: AdmitOutcome,
): Promise<void> {
  const found = await candidate(deps.files, layout, decision.id);
  if (typeof found === "string") { outcome.failed.push(`${decision.id}: ${found}`); return; }
  try {
    const previous = await readOrNull(deps.files, layout.refused);
    const motif = decision.motif?.trim() || DEFAULT_REFUSAL_MOTIF;
    await deps.files.write(layout.refused, appendRefused(previous, { topic: found.topic, project: found.project, date: today, motif }));
  } catch (error) {
    outcome.failed.push(`${decision.id}: ${layout.refused} not written (${firstLine(error)}), the candidate stays`);
    return;
  }
  outcome.refused.push(decision.id);
  await pointer(deps.files, layout, decision.id, decidedPointer("refused", today), outcome);
}

async function pointer(files: Pick<Files, "write">, layout: MemoryLayout, id: string, text: string, outcome: AdmitOutcome): Promise<void> {
  try {
    await files.write(candidatePath(layout, id), text);
  } catch (error) {
    outcome.warnings.push(`${candidatePath(layout, id)} still reads as a candidate (${firstLine(error)}): /memory-admit will say it is decided`);
  }
}

export async function admitEntries(
  deps: AdmitDeps, memory: { layout: MemoryLayout; collection: string }, decisions: AdmitDecisions,
): Promise<AdmitOutcome> {
  const outcome: AdmitOutcome = { admitted: [], refused: [], failed: [], warnings: [] };
  const today = deps.clock().toISOString().slice(0, 10);
  for (const decision of decisions.refuse) await refuseOne(deps, memory.layout, decision, today, outcome);
  for (const confirmed of decisions.admit) await admitOne(deps, memory.layout, confirmed, today, outcome);
  if (outcome.admitted.length + outcome.refused.length === 0) return outcome;
  for (const line of [await refreshCandidatesList(deps.files, memory.layout), await refreshIndexFile(deps.files, memory.layout)]) {
    if (line !== null) outcome.warnings.push(line);
  }
  if (outcome.admitted.length > 0) {
    try {
      const report = await deps.memory.ingest(memory.collection, [memory.layout.entriesGlob], { prune: true });
      for (const error of report.errors) outcome.warnings.push(`index: ${error}`);
    } catch (error) {
      outcome.warnings.push(`the index of ${memory.collection} is stale (${firstLine(error)}): the next admission re-ingests entries/`);
    }
  }
  return outcome;
}

/** The outcome as the crew's answer: one line per decision, then the warnings. */
export function admitReport(outcome: AdmitOutcome): string {
  return [
    ...outcome.admitted.map((id) => `admitted ${id}`),
    ...outcome.refused.map((id) => `refused ${id}`),
    ...outcome.failed.map((line) => `not applied: ${line}`),
    ...outcome.warnings.map((line) => `warning: ${line}`),
  ].join("\n") || "nothing to apply";
}
