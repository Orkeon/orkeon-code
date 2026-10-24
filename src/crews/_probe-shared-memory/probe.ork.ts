// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
// Shared-memory recall probe (no model call): measures the recall of the shared memory on its
// reference set before a release, the live check the Node tests cannot make.
//
// The workspace holds the fixture tests/fixtures/shared-memory/ staged as /workspace/.orkeon/memory
// (scripts/check-shared-memory.sh does it). The probe
//   1. calls rag_eval on eval/golden.yaml: the corpus entries/ is ingested (reindex) into the
//      dataset's own collection, memory-eval-golden, never a project's memory-<project>;
//   2. reads recall@5 and the reciprocal rank of each case and averages them over the cases with a
//      `relevant` (q13, the negative case, has none);
//   3. runs the repository's own recallEntries on the same collection for q08 (the superseded id is
//      never kept) and q13 (buildPrecedentsBlock renders no block);
//   4. prints a PASS/FAIL table and a last line `shared-memory probe: PASS|FAIL`.
// rag_eval declares no access, so it is asked even in acceptEdits: run it interactively or under an
// allow rule. q13 holds only when the run's settings set a retrieval score floor
// (Orkeon:Rag:Retrieval:MinScore; none by default, then every query returns passages).
//
// Run:  bash scripts/check-shared-memory.sh

import { AgentBuilder, CrewBuilder, Tools, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonFiles, orkeonSharedMemory } from "../../shared/infrastructure/orkeon/wiring.ts";
import { recallEntries } from "../../shared/application/shared-memory/recall-precedents.ts";
import { buildPrecedentsBlock } from "../../shared/domain/shared-memory/precedents-block.ts";
import { parseEntry } from "../../shared/domain/shared-memory/front-matter.ts";
import { DEFAULT_MEMORY_DIR, memoryLayout } from "../../shared/domain/shared-memory/layout.ts";
import {
  EVAL_K, NEGATIVE_CASE, SUPERSESSION_CASE, parseGolden, probeRows, renderProbeTable, retrievalScores,
} from "./domain/probe-verdict.ts";
import type { GoldenCase, ProbeFacts } from "./domain/probe-verdict.ts";

const message = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

const probe = AgentBuilder()
  .name("probe")
  .role("Shared-memory recall probe")
  .goal("Evaluate the shared memory's recall on its reference set and report PASS or FAIL per threshold.")
  // No tool for a model: the body calls rag_eval and the RAG itself, and makes no model call.
  .tools([])
  .body(async () => {
    const layout = memoryLayout(DEFAULT_MEMORY_DIR);
    const files = orkeonFiles();
    const memory = { layout, collection: "" };
    const deps = { memory: orkeonSharedMemory(), files };
    const golden = parseGolden(await files.read(layout.golden));
    memory.collection = golden.collection;
    const caseOf = (id: string): GoldenCase => {
      const found = golden.cases.find((c) => c.id === id);
      if (found === undefined) throw new Error(`golden.yaml has no case ${id}`);
      return found;
    };
    const recalledIds = async (question: string) =>
      (await recallEntries(deps, { memory, query: question })).precedents;

    const result = await Tools.ragEval({ dataset: layout.golden, collection: golden.collection, k: EVAL_K, reindex: true });
    const scores = retrievalScores(golden, result);

    let supersession: ProbeFacts["supersession"];
    try {
      const target = caseOf(SUPERSESSION_CASE);
      const superseded: string[] = [];
      for (const source of target.relevant) {
        const parsed = parseEntry(await files.read(`${layout.root}/${source}`));
        if (!parsed.ok) throw new Error(`${source}: ${parsed.problems.join("; ")}`);
        superseded.push(...parsed.entry.supersedes);
      }
      const recalled = (await recalledIds(target.question)).map((p) => p.entry.id);
      supersession = { recalled, superseded };
    } catch (error) {
      supersession = { error: message(error) };
    }

    let negative: ProbeFacts["negative"];
    try {
      const precedents = await recalledIds(caseOf(NEGATIVE_CASE).question);
      negative = { block: buildPrecedentsBlock(precedents), recalled: precedents.map((p) => p.entry.id) };
    } catch (error) {
      negative = { error: message(error) };
    }

    const reports = (result as { reports?: readonly string[] } | undefined)?.reports ?? [];
    return [
      `collection: ${golden.collection}`,
      ...(reports.length > 0 ? [`rag_eval reports: ${reports.join(", ")}`] : []),
      "",
      renderProbeTable(probeRows({ scores, supersession, negative })),
    ].join("\n");
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("probe-shared-memory")
    .process("sequential")
    .withAgent(probe)
    .build(),
);
