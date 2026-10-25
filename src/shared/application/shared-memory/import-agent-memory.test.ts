// importAgentMemory (M-9): one candidate per entry of a sample MEMORY.md, none for a duplicate.
// Run: node --test src/shared/application/shared-memory/import-agent-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { importAgentMemory, importReport } from "./import-agent-memory.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";
import {
  CONTRACT_CANDIDATE, CONTRACT_NOTE, CUT_POSITIONS, candidateFiles, emptyWorld, layout, memory, noteWithTokenAt, setup,
} from "./import-agent-memory.fixtures.ts";
import { assertEntry, assertMentions } from "./import-agent-memory.assertions.ts";

describe("importAgentMemory", () => {
  it("writes one candidate per entry and none for a duplicate", async () => {
    // Arrange
    const { files, run } = setup();

    // Act
    const outcome = await run();

    // Assert
    deepStrictEqual(outcome.written.map((w) => w.id), [
      "shop-method-20261024-name-the-port-before-the-adapter",
      "shop-method-20261024-contract-tests-first",
    ]);
    deepStrictEqual(outcome.duplicates.map((d) => `${d.agent}:${d.line} ${d.topic}`), [
      "dev-auditor:2 name-the-port-before-the-adapter",
      "dev-auditor:3 contract-tests-first",
      "dev-auditor:4 admitted-already",
    ]);
    deepStrictEqual(outcome.refused, []);
    strictEqual(candidateFiles(files).length, 2);
    for (const path of candidateFiles(files)) assertEntry(files.files.get(path), { status: "candidate" }, path);
    assertEntry(files.files.get(CONTRACT_CANDIDATE), { rationale: "two batches lost a day." });
    ok(files.files.get(layout.candidatesList)?.includes("contract-tests-first"));
    ok(![...files.writes].some((w) => w.path.includes("/.claude/")), "nothing written under .claude/");
  });

  it("writes nothing new when run again", async () => {
    // Arrange
    const { files, run } = setup();
    await run();
    const before = candidateFiles(files);

    // Act
    const again = await run();

    // Assert
    deepStrictEqual(again.written, []);
    strictEqual(again.duplicates.length, 5);
    deepStrictEqual(candidateFiles(files), before);
  });

  it("holds a pushed candidate's title as well as its own topic", async () => {
    // Arrange
    const { files, run } = setup();
    const pushed = sampleEntry("method", "port-naming", { status: "candidate", title: "Name the port before the adapter" });
    files.files.set(`${layout.candidates}/${pushed.id}.md`, entryText(pushed));

    // Act
    const outcome = await run();

    // Assert
    ok(!outcome.written.some((w) => w.id.includes("name-the-port")));
  });

  // The body keeps at most MAX_BODY_CHARS: a token across that cut left a stub too short for its pattern.
  for (const n of CUT_POSITIONS) {
    it(`refuses an item whose note holds a secret where the body cuts it, rather than write part of it (token at ${n})`, async () => {
      // Arrange
      const { files, run } = setup();
      files.files.set(CONTRACT_NOTE, noteWithTokenAt(n));

      // Act
      const outcome = await run();

      // Assert
      ok(outcome.refused.some((r) => r.agent === "dev-auditor" && r.line === 1 && /secret \(GitHub token\)/.test(r.reason)), `at ${n}`);
      ok(!candidateFiles(files).some((p) => files.files.get(p)!.includes("ghp_")), `no candidate holds part of the token at ${n}`);
    });
  }

  it("skips a refused topic and reports it", async () => {
    // Arrange
    const { files, run } = setup();
    files.files.set(layout.refused, appendRefused(null, { topic: "contract-tests-first", project: "shop", date: "2026-10-20", motif: "too local" }));

    // Act
    const outcome = await run();

    // Assert
    ok(outcome.refused.some((r) => r.line === 1 && /refused/.test(r.reason)));
    ok(!outcome.written.some((w) => w.id.includes("contract-tests-first")));
  });

  it("finds no agent when no agent memory exists", async () => {
    // Arrange
    const deps = emptyWorld();

    // Act
    const outcome = await importAgentMemory(deps, memory);

    // Assert
    deepStrictEqual(outcome.agents, []);
  });

  it("says so when no agent memory exists", async () => {
    // Arrange
    const outcome = await importAgentMemory(emptyWorld(), memory);

    // Act
    const text = importReport(outcome);

    // Assert
    ok(text.startsWith("No harness agent memory in /workspace/.claude/agent-memory"), text);
  });

  it("reports the agents, the candidates and the duplicates", async () => {
    // Arrange
    const outcome = await setup().run();

    // Act
    const text = importReport(outcome);

    // Assert
    assertMentions(text, [
      "/workspace/.claude/agent-memory/dev-auditor/MEMORY.md: 4 entries",
      "2 candidate(s) written: shop-method-20261024-name-the-port-before-the-adapter, shop-method-20261024-contract-tests-first",
      "3 duplicate(s) skipped",
    ]);
  });
});
