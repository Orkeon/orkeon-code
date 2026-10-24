// stepPrecedents, recallQuery and precedentsLine over FakeSharedMemory, FakeFiles and the config (M-6). Run:
//   node --test src/shared/application/dev/step-precedents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { MAX_RECALL_QUERY_CHARS, TRIGGER_TYPES, precedentsLine, recallQuery, sheetTitle, stepPrecedents } from "./step-precedents.ts";
import { memoryLayout } from "../../domain/shared-memory/layout.ts";
import { FakeSharedMemory } from "../../../../tests/doubles/fake-shared-memory.ts";
import { entryText, sampleEntry } from "../../../../tests/doubles/memory-entries.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";

const layout = memoryLayout(".orkeon/memory");
const pathOf = (e: MemoryEntry) => `${layout.entries}/${e.type}/${e.id}.md`;

function setup(entries: MemoryEntry[], values: Record<string, string> = { "memory.project": "shop" }) {
  const memory = new FakeSharedMemory();
  const files = new FakeFiles();
  entries.forEach((e, i) => {
    files.files.set(pathOf(e), entryText(e));
    memory.hits.push({ sourceId: pathOf(e), score: 1 - i / 10 });
  });
  let reads = 0;
  const config = { readValue: async (key: string) => { reads++; return { key, value: values[key], source: "file" } as never; } };
  const log = new FakeLogger();
  return { memory, files, config, shell: new FakeShell(), log, reads: () => reads };
}

describe("stepPrecedents", () => {
  it("recalls the trigger's types in the project's collection and renders the block with its ids", async () => {
    const mistake = sampleEntry("mistake", "n-plus-one");
    const decision = sampleEntry("decision", "money");
    const deps = setup([decision, mistake]);
    const recalled = await stepPrecedents(deps, { on: true })("T4", "sheet title — src/a.ts");
    ok(recalled.block.startsWith("## Precedents\n"), recalled.block);
    ok(recalled.block.includes(mistake.id));
    ok(!recalled.block.includes(decision.id), "T4 asks for mistakes only");
    deepStrictEqual(recalled.ids, [mistake.id]);
    deepStrictEqual(deps.memory.searches.map((s) => s.collection), ["memory-shop"]);
  });

  it("reads the settings once per run, whatever the number of recalls", async () => {
    const deps = setup([sampleEntry("decision", "money")]);
    const recall = stepPrecedents(deps, { on: true });
    await recall("T1", "a");
    const after = deps.reads();
    await recall("T2", "b");
    strictEqual(deps.reads(), after);
  });

  it("recalls nothing when no admitted entry matches: no block, no id", async () => {
    const deps = setup([sampleEntry("decision", "money", { status: "candidate" })]);
    deepStrictEqual(await stepPrecedents(deps, { on: true })("T2", "q"), { block: "", ids: [] });
  });

  it("asks nothing when memory_recall is denied", async () => {
    const deps = setup([sampleEntry("mistake", "x")]);
    deepStrictEqual(await stepPrecedents(deps, { on: false })("T4", "q"), { block: "", ids: [] });
    strictEqual(deps.memory.searches.length, 0);
  });

  it("costs the block, never the step, when the index cannot answer, and says so", async () => {
    const deps = setup([sampleEntry("mistake", "x")]);
    deps.memory.searchFailure = new Error("rag is not configured\nstack");
    deepStrictEqual(await stepPrecedents(deps, { on: true })("T5", "q"), { block: "", ids: [] });
    ok(deps.log.lines.some((w) => w.startsWith("warn: ") && w.includes("recall T5 failed") && w.includes("rag is not configured") && !w.includes("stack")), deps.log.lines.join("\n"));
  });

  it("maps each trigger to the types of temp/05 § 4.1", () => {
    deepStrictEqual(TRIGGER_TYPES, {
      T1: ["decision", "method"], T2: ["decision", "code-structure"], T3: ["code-structure", "mistake"],
      T4: ["mistake"], T5: ["mistake"],
    });
  });
});

describe("recallQuery", () => {
  it("joins the parts on one line, drops blank ones and cuts at the bound", () => {
    strictEqual(recallQuery(["  Add  prune\n mode ", "", "src/a.ts"]), "Add prune mode — src/a.ts");
    strictEqual(recallQuery(["x".repeat(MAX_RECALL_QUERY_CHARS + 50)]).length, MAX_RECALL_QUERY_CHARS);
    strictEqual(recallQuery([" ", "\n"]), "");
  });
});

describe("precedentsLine", () => {
  it("names each id once, or nothing", () => {
    strictEqual(precedentsLine([{ block: "b", ids: ["a", "b"] }, { block: "c", ids: ["b"] }]), "precedents recalled: a, b");
    strictEqual(precedentsLine([{ block: "", ids: [] }]), "");
  });
});

describe("sheetTitle", () => {
  it("is the first '# ' heading, or empty", () => {
    strictEqual(sheetTitle("intro\n## F1\n# DEMO-PLAN-F1 — Prune by age \n# Other"), "DEMO-PLAN-F1 — Prune by age");
    strictEqual(sheetTitle("## only a level two"), "");
  });
});
