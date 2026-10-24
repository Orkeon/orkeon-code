// importAgentMemory (M-9): one candidate per entry of a sample MEMORY.md, none for a duplicate.
// Run: node --test src/shared/application/shared-memory/import-agent-memory.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { HARNESS_AGENT_MEMORY_ROOT, importAgentMemory, importReport } from "./import-agent-memory.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { parseEntry } from "../../domain/shared-memory/front-matter.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { LiveListingFiles } from "../../../../tests/doubles/live-listing-files.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";

const layout = memoryLayout(".orkeon/memory");
const memory = { layout, project: "shop" };
const root = HARNESS_AGENT_MEMORY_ROOT;
const SAMPLE = [
  "- [Contract tests first](contract.md) — run them before the unit suite",
  "- Name the port before the adapter",
  "- Contract tests first",
  "- [Admitted already](gone.md) — an entry holds this topic",
].join("\n");

function setup() {
  const files = new LiveListingFiles();
  files.files.set(`${root}/dev-auditor/MEMORY.md`, SAMPLE);
  files.files.set(`${root}/dev-auditor/contract.md`, "---\nname: c\n---\nA broken port fails fast.\n\n**Why:** two batches lost a day.\n");
  files.files.set(`${root}/adversarial-reviewer/MEMORY.md`, "- name the port before the adapter\n");
  const admitted = sampleEntry("decision", "admitted-already");
  files.files.set(`${layout.entries}/decision/${admitted.id}.md`, entryText(admitted));
  const deps = { files, clock: () => new Date("2026-10-24T10:00:00Z") };
  return { files, run: () => importAgentMemory(deps, memory) };
}

const candidateFiles = (files: LiveListingFiles): string[] =>
  [...files.files.keys()].filter((p) => p.startsWith(`${layout.candidates}/`) && !p.endsWith("CANDIDATES.md")).sort();

describe("importAgentMemory", () => {
  it("writes one candidate per entry and none for a duplicate", async () => {
    const { files, run } = setup();
    const outcome = await run();
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
    for (const path of candidateFiles(files)) {
      const parsed = parseEntry(files.files.get(path) ?? "");
      ok(parsed.ok && parsed.entry.status === "candidate", path);
    }
    const contract = parseEntry(files.files.get(`${layout.candidates}/shop-method-20261024-contract-tests-first.md`) ?? "");
    ok(contract.ok && contract.entry.rationale === "two batches lost a day.");
    ok(files.files.get(layout.candidatesList)?.includes("contract-tests-first"));
    ok(![...files.writes].some((w) => w.path.includes("/.claude/")), "nothing written under .claude/");
  });

  it("writes nothing new when run again", async () => {
    const { files, run } = setup();
    await run();
    const before = candidateFiles(files);
    const again = await run();
    deepStrictEqual(again.written, []);
    strictEqual(again.duplicates.length, 5);
    deepStrictEqual(candidateFiles(files), before);
  });

  it("holds a pushed candidate's title as well as its own topic", async () => {
    const { files, run } = setup();
    const pushed = sampleEntry("method", "port-naming", { status: "candidate", title: "Name the port before the adapter" });
    files.files.set(`${layout.candidates}/${pushed.id}.md`, entryText(pushed));
    const outcome = await run();
    ok(!outcome.written.some((w) => w.id.includes("name-the-port")));
  });

  it("refuses an item whose note holds a secret where the body cuts it, rather than write part of it", async () => {
    // The body keeps at most MAX_BODY_CHARS: a token across that cut left a stub too short for its pattern.
    for (let n = 1_500; n <= 2_100; n += 20) {
      const { files, run } = setup();
      const note = `${"word ".repeat(500).slice(0, n)} ghp_${"A1b2".repeat(10)} end\n`;
      files.files.set(`${root}/dev-auditor/contract.md`, `---\nname: c\n---\n${note}`);
      const outcome = await run();
      ok(outcome.refused.some((r) => r.agent === "dev-auditor" && r.line === 1 && /secret \(GitHub token\)/.test(r.reason)), `at ${n}`);
      ok(!candidateFiles(files).some((p) => files.files.get(p)!.includes("ghp_")), `no candidate holds part of the token at ${n}`);
    }
  });

  it("skips a refused topic and reports it", async () => {
    const { files, run } = setup();
    files.files.set(layout.refused, appendRefused(null, { topic: "contract-tests-first", project: "shop", date: "2026-10-20", motif: "too local" }));
    const outcome = await run();
    ok(outcome.refused.some((r) => r.line === 1 && /refused/.test(r.reason)));
    ok(!outcome.written.some((w) => w.id.includes("contract-tests-first")));
  });

  it("says so when no agent memory exists", async () => {
    const outcome = await importAgentMemory({ files: new LiveListingFiles(), clock: () => new Date() }, memory);
    deepStrictEqual(outcome.agents, []);
    ok(importReport(outcome).startsWith("No harness agent memory in /workspace/.claude/agent-memory"));
  });

  it("reports the agents, the candidates and the duplicates", async () => {
    const { run } = setup();
    const text = importReport(await run());
    ok(text.includes("/workspace/.claude/agent-memory/dev-auditor/MEMORY.md: 4 entries"));
    ok(text.includes("2 candidate(s) written: shop-method-20261024-name-the-port-before-the-adapter, shop-method-20261024-contract-tests-first"));
    ok(text.includes("3 duplicate(s) skipped"));
  });
});
