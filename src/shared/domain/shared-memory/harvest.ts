// Mistake candidates from audit rows, pure (temp/05 § 3.2): the Blocking and Major gaps of the
// verdict files, grouped by the topic of their text, become one candidate each once they recur in
// MISTAKE_MIN_BATCHES distinct batches. Refused topics are left out and named.

import { MAX_BODY_CHARS, MAX_TITLE_CHARS, entryIdPrefix } from "./entry.ts";
import type { MemoryEntry } from "./entry.ts";
import { MISTAKE_MIN_BATCHES } from "./gate.ts";
import { topicOf } from "./refused.ts";
import type { LearnRow } from "./verdict-rows.ts";

export interface HarvestPlan {
  candidates: MemoryEntry[];
  /** Topics left out because refused.md holds them. */
  refused: string[];
  /** Topics seen in fewer batches than the threshold, with their count. */
  below: Array<{ topic: string; batches: number }>;
}

const cut = (text: string, n: number): string => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
};

/** The body, its evidence lines cut from the end (one at least) to stay under MAX_BODY_CHARS. */
function bodyOf(rows: number, batches: number, content: string, evidence: string[]): string {
  const head = ["## Context", `Harvested from ${rows} audit rows of ${batches} batches.`, "", "## Content", content, "", "## Evidence"];
  const kept = [...evidence];
  const text = (): string => [...head, ...kept, ...(kept.length < evidence.length ? [`- and ${evidence.length - kept.length} more rows`] : [])].join("\n") + "\n";
  while (kept.length > 1 && text().length > MAX_BODY_CHARS) kept.pop();
  return text();
}

export function mistakeCandidates(
  rows: readonly LearnRow[], context: { project: string; date: string; refusedTopics: ReadonlySet<string> },
): HarvestPlan {
  const byTopic = new Map<string, LearnRow[]>();
  for (const row of rows) {
    const topic = topicOf(row.gap);
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), row]);
  }
  const plan: HarvestPlan = { candidates: [], refused: [], below: [] };
  for (const [topic, group] of [...byTopic].sort(([a], [b]) => a.localeCompare(b))) {
    const batches = [...new Set(group.map((r) => r.batch))].sort();
    if (context.refusedTopics.has(topic)) { plan.refused.push(topic); continue; }
    if (batches.length < MISTAKE_MIN_BATCHES) { plan.below.push({ topic, batches: batches.length }); continue; }
    const first = group[0];
    const sources = [...new Set(group.map((r) => r.source))].sort();
    const evidence = group.map((r) => `- \`${r.source}:${r.line}\` (${r.batch}, ${r.severity}): ${cut(r.evidence || r.gap, 160)}`);
    plan.candidates.push({
      id: `${entryIdPrefix(context.project, "mistake", context.date)}${topic}`,
      type: "mistake", title: cut(first.gap, MAX_TITLE_CHARS), project: context.project, date: context.date, topic,
      appliesWhen: `a batch is audited on the ${first.axis} axis`,
      rationale: `the audit flagged it in ${batches.length} batches: ${batches.join(", ")}`,
      correction: cut(group.find((r) => r.fix.trim() !== "")?.fix ?? "see the expected fix of the rows under Evidence", 300),
      detectionSignal: `an audit row on the ${first.axis} axis: ${cut(first.gap, 160)}`,
      source: `audit:${sources.join(", ")}`, status: "candidate", supersedes: [], tags: [], stack: [],
      body: bodyOf(group.length, batches.length, cut(first.gap, 400), evidence),
    });
  }
  return plan;
}
