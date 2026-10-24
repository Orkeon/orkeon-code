// importAgentMemory: the harness's agent memory (.claude/agent-memory/<agent>/MEMORY.md, read only)
// lifted into shared-memory candidates, one per entry (lot M-9, temp/05 § 8.2). Never an admission:
// /memory-admit decides each candidate. An entry whose topic a pending candidate, a stored entry or an
// earlier entry of the same import already holds is a duplicate and writes nothing; a refused topic
// or an invalid entry is reported by writeCandidate's own checks.

import type { Files } from "../ports.ts";
import { MEMORY_WORKSPACE } from "../../domain/shared-memory/layout.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";
import {
  AGENT_MEMORY_INDEX, HARNESS_AGENT_MEMORY_DIR, MAX_NOTE_CHARS, importedEntry, parseAgentMemoryIndex, parseAgentNote,
} from "../../domain/shared-memory/agent-memory-import.ts";
import type { AgentNote } from "../../domain/shared-memory/agent-memory-import.ts";
import { MAX_LISTED, pendingCandidates, readOrNull, storedEntries } from "./memory-files.ts";
import { writeCandidate } from "./push-candidate.ts";

export const HARNESS_AGENT_MEMORY_ROOT = `${MEMORY_WORKSPACE}/${HARNESS_AGENT_MEMORY_DIR}`;

export interface ImportOutcome {
  /** The agents whose MEMORY.md was read, with their entry count. */
  agents: Array<{ agent: string; entries: number }>;
  written: Array<{ id: string; path: string }>;
  duplicates: Array<{ agent: string; line: number; topic: string }>;
  refused: Array<{ agent: string; line: number; reason: string }>;
  warnings: string[];
}

export interface ImportDeps {
  files: Pick<Files, "read" | "write" | "list">;
  clock: () => Date;
}

const firstLine = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

/** Reads every agent's MEMORY.md under `root` and writes a candidate per entry not already held. */
export async function importAgentMemory(
  deps: ImportDeps, memory: { layout: MemoryLayout; project: string }, root: string = HARNESS_AGENT_MEMORY_ROOT,
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { agents: [], written: [], duplicates: [], refused: [], warnings: [] };
  let agents: string[];
  try {
    agents = (await deps.files.list(root, MAX_LISTED)).map((n) => n.replace(/\/+$/, "").split("/").pop() ?? n)
      .filter((n) => n !== "" && !n.startsWith(".") && n !== AGENT_MEMORY_INDEX).sort();
  } catch {
    return outcome;
  }
  const held = new Set<string>();
  for (const stored of [...await pendingCandidates(deps.files, memory.layout), ...await storedEntries(deps.files, memory.layout)]) {
    held.add(stored.entry.topic);
  }
  const date = deps.clock().toISOString().slice(0, 10);
  for (const agent of [...new Set(agents)]) {
    const folder = `${root}/${agent}`;
    let index: string | null;
    try {
      index = await readOrNull(deps.files, `${folder}/${AGENT_MEMORY_INDEX}`);
    } catch (error) {
      outcome.warnings.push(`${folder}/${AGENT_MEMORY_INDEX} cannot be read (${firstLine(error)})`);
      continue;
    }
    if (index === null) continue;
    const items = parseAgentMemoryIndex(index);
    outcome.agents.push({ agent, entries: items.length });
    for (const item of items) {
      let note: AgentNote | null = null;
      if (item.note !== undefined) {
        try {
          const text = await readOrNull(deps.files, `${folder}/${item.note}`);
          note = text === null ? null : parseAgentNote(text.slice(0, MAX_NOTE_CHARS));
        } catch (error) {
          outcome.warnings.push(`${folder}/${item.note} cannot be read (${firstLine(error)}): the line alone is imported`);
        }
      }
      const entry = importedEntry(item, note, { agent, project: memory.project, date });
      if (held.has(entry.topic)) {
        outcome.duplicates.push({ agent, line: item.line, topic: entry.topic });
        continue;
      }
      const written = await writeCandidate(deps, memory, entry);
      if (!written.ok) {
        outcome.refused.push({ agent, line: item.line, reason: written.refused });
        continue;
      }
      held.add(entry.topic);
      outcome.written.push({ id: written.id, path: written.path });
      for (const warning of written.warnings) if (!outcome.warnings.includes(warning)) outcome.warnings.push(warning);
    }
  }
  return outcome;
}

/** The lines the operator reads after an import. */
export function importReport(outcome: ImportOutcome, root: string = HARNESS_AGENT_MEMORY_ROOT): string {
  if (outcome.agents.length === 0) return `No harness agent memory in ${root} (no <agent>/${AGENT_MEMORY_INDEX}).`;
  const lines = outcome.agents.map((a) => `${root}/${a.agent}/${AGENT_MEMORY_INDEX}: ${a.entries} entr${a.entries === 1 ? "y" : "ies"}`);
  lines.push(outcome.written.length === 0 ? "No candidate written."
    : `${outcome.written.length} candidate(s) written: ${outcome.written.map((w) => w.id).join(", ")}`);
  if (outcome.duplicates.length > 0) {
    lines.push(`${outcome.duplicates.length} duplicate(s) skipped (topic already held): ${outcome.duplicates.map((d) => `${d.agent}:${d.line} ${d.topic}`).join(", ")}`);
  }
  for (const r of outcome.refused) lines.push(`✗ ${r.agent}/${AGENT_MEMORY_INDEX}:${r.line}: ${r.reason}`);
  for (const w of outcome.warnings) lines.push(`warning: ${w}`);
  if (outcome.written.length > 0) lines.push("Decide them with /memory-admit (each one is asked).");
  return lines.join("\n");
}
