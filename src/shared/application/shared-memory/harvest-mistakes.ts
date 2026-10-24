// harvestMistakes: the mistake candidates the audit rows of a work folder justify (domain
// harvest.ts), each written through writeCandidate, unless a candidate or an entry already holds
// its topic. Called after a GAPS verdict (lot M-7 wires it into /dev-verify).

import { mistakeCandidates } from "../../domain/shared-memory/harvest.ts";
import type { LearnRow } from "../../domain/shared-memory/verdict-rows.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";
import { pendingCandidates, refusedTopics, storedEntries } from "./memory-files.ts";
import { writeCandidate } from "./push-candidate.ts";
import type { PushDeps } from "./push-candidate.ts";

export interface HarvestOutcome {
  written: string[];
  /** One line per topic left out, with the reason. */
  skipped: string[];
}

export async function harvestMistakes(
  deps: PushDeps, memory: { layout: MemoryLayout; project: string }, rows: readonly LearnRow[],
): Promise<HarvestOutcome> {
  const outcome: HarvestOutcome = { written: [], skipped: [] };
  let refused: Set<string>;
  try {
    refused = await refusedTopics(deps.files, memory.layout);
  } catch (error) {
    outcome.skipped.push(`refused.md cannot be read (${String((error as Error)?.message ?? error).split("\n")[0]}): nothing harvested`);
    return outcome;
  }
  const date = deps.clock().toISOString().slice(0, 10);
  const plan = mistakeCandidates(rows, { project: memory.project, date, refusedTopics: refused });
  for (const topic of plan.refused) outcome.skipped.push(`${topic}: refused (refused.md)`);
  const held = new Set([...await pendingCandidates(deps.files, memory.layout), ...await storedEntries(deps.files, memory.layout)]
    .filter((s) => s.entry.type === "mistake").map((s) => s.entry.topic));
  for (const candidate of plan.candidates) {
    if (held.has(candidate.topic)) {
      outcome.skipped.push(`${candidate.topic}: a mistake candidate or entry already holds it`);
      continue;
    }
    const pushed = await writeCandidate(deps, memory, candidate);
    if (pushed.ok) outcome.written.push(pushed.path);
    else outcome.skipped.push(`${candidate.topic}: ${pushed.refused}`);
  }
  return outcome;
}
