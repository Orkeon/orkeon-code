// stepPrecedents, recallQuery and precedentsLine over FakeSharedMemory, FakeFiles and the config (M-6). Run:
//   node --test src/shared/application/dev/step-precedents.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_RECALL_QUERY_CHARS, TRIGGER_TYPES, precedentsLine, recallQuery, sheetTitle, stepPrecedents } from "../../../../src/shared/application/dev/step-precedents.ts";
import { sampleEntry } from "../../../support/fixtures/memory-entries.ts";
import { EXPECTED_TRIGGER_TYPES, setup } from "./step-precedents.fixtures.ts";
import { assertPrecedentsBlock, assertWarning } from "./step-precedents.assertions.ts";

describe("stepPrecedents", () => {
  it("recalls the trigger's types in the project's collection and renders the block with its ids", async () => {
    // Arrange
    const mistake = sampleEntry("mistake", "n-plus-one");
    const decision = sampleEntry("decision", "money");
    const deps = setup([decision, mistake]);

    // Act
    const recalled = await stepPrecedents(deps, { on: true })("T4", "sheet title — src/a.ts");

    // Assert
    assertPrecedentsBlock(recalled.block, [mistake.id], [decision.id]);
    deepStrictEqual(recalled.ids, [mistake.id]);
    deepStrictEqual(deps.memory.searches.map((s) => s.collection), ["memory-shop"]);
  });

  it("reads the settings once per run, whatever the number of recalls", async () => {
    // Arrange
    const deps = setup([sampleEntry("decision", "money")]);
    const recall = stepPrecedents(deps, { on: true });
    await recall("T1", "a");
    const after = deps.reads();

    // Act
    await recall("T2", "b");

    // Assert
    strictEqual(deps.reads(), after);
  });

  it("recalls nothing when no admitted entry matches: no block, no id", async () => {
    // Arrange
    const deps = setup([sampleEntry("decision", "money", { status: "candidate" })]);

    // Act
    const recalled = await stepPrecedents(deps, { on: true })("T2", "q");

    // Assert
    deepStrictEqual(recalled, { block: "", ids: [] });
  });

  it("asks nothing when memory_recall is denied", async () => {
    // Arrange
    const deps = setup([sampleEntry("mistake", "x")]);

    // Act
    const recalled = await stepPrecedents(deps, { on: false })("T4", "q");

    // Assert
    deepStrictEqual(recalled, { block: "", ids: [] });
    strictEqual(deps.memory.searches.length, 0);
  });

  it("costs the block, never the step, when the index cannot answer, and says so", async () => {
    // Arrange
    const deps = setup([sampleEntry("mistake", "x")]);
    deps.memory.searchFailure = new Error("rag is not configured\nstack");

    // Act
    const recalled = await stepPrecedents(deps, { on: true })("T5", "q");

    // Assert
    deepStrictEqual(recalled, { block: "", ids: [] });
    assertWarning(deps.log.lines, ["recall T5 failed", "rag is not configured"], ["stack"]);
  });

  it("maps each trigger to the types of temp/05 § 4.1", () => {
    // Arrange
    const expected = EXPECTED_TRIGGER_TYPES;

    // Act
    const types = TRIGGER_TYPES;

    // Assert
    deepStrictEqual(types, expected);
  });
});

describe("recallQuery", () => {
  it("joins the parts on one line and drops blank ones", () => {
    // Arrange
    const parts = ["  Add  prune\n mode ", "", "src/a.ts"];

    // Act
    const query = recallQuery(parts);

    // Assert
    strictEqual(query, "Add prune mode — src/a.ts");
  });

  it("cuts at the bound", () => {
    // Arrange
    const parts = ["x".repeat(MAX_RECALL_QUERY_CHARS + 50)];

    // Act
    const query = recallQuery(parts);

    // Assert
    strictEqual(query.length, MAX_RECALL_QUERY_CHARS);
  });

  it("is empty when every part is blank", () => {
    // Arrange
    const parts = [" ", "\n"];

    // Act
    const query = recallQuery(parts);

    // Assert
    strictEqual(query, "");
  });
});

describe("precedentsLine", () => {
  it("names each id once", () => {
    // Arrange
    const recalls = [{ block: "b", ids: ["a", "b"] }, { block: "c", ids: ["b"] }];

    // Act
    const line = precedentsLine(recalls);

    // Assert
    strictEqual(line, "precedents recalled: a, b");
  });

  it("is empty when no id was recalled", () => {
    // Arrange
    const recalls = [{ block: "", ids: [] }];

    // Act
    const line = precedentsLine(recalls);

    // Assert
    strictEqual(line, "");
  });
});

describe("sheetTitle", () => {
  it("is the first '# ' heading", () => {
    // Arrange
    const sheet = "intro\n## F1\n# DEMO-PLAN-F1 — Prune by age \n# Other";

    // Act
    const title = sheetTitle(sheet);

    // Assert
    strictEqual(title, "DEMO-PLAN-F1 — Prune by age");
  });

  it("is empty with no '# ' heading", () => {
    // Arrange
    const sheet = "## only a level two";

    // Act
    const title = sheetTitle(sheet);

    // Assert
    strictEqual(title, "");
  });
});
