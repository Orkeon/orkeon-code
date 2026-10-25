// The state file of a dev batch and the session's pointer to it. Run:
//   node --test src/shared/domain/workflow/state-file.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  MAX_STATE_LINE_CHARS, MAX_TREE_LINES, batchesStatePath, boundLine, firstOpenStep, formatActiveWorkflow, parseActiveWorkflow, renderStateFile,
  sheetStateSteps, stateFilePath,
} from "./state-file.ts";
import { parseBatchSheet } from "../dev/plan-format.ts";
import {
  EMPTY_MENTIONS, F2, LONG, MANY_EVENTS, MANY_TREE_LINES, NO_POINTERS, PHASE_ONLY, STATE_MENTIONS, longSteps, stateFacts,
} from "./state-file.fixtures.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("the pointer to the batch in progress", () => {
  it("round-trips a code and a phase", () => {
    // Arrange
    const raw = formatActiveWorkflow({ code: "demo", phase: "F2" });

    // Act
    const pointer = parseActiveWorkflow(raw);

    // Assert
    strictEqual(pointer?.code, "demo");
  });

  for (const c of PHASE_ONLY) {
    it(`keeps a phase without a code: ${c.name}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const pointer = parseActiveWorkflow(raw);

      // Assert
      deepStrictEqual(pointer, c.pointer);
    });
  }

  for (const v of NO_POINTERS) {
    it(`reads nothing from an absent, blank or malformed value: ${String(v)}`, () => {
      // Arrange
      const raw = v;

      // Act
      const pointer = parseActiveWorkflow(raw);

      // Assert
      strictEqual(pointer, null, String(v));
    });
  }

  it("names the state file under Code's state folder", () => {
    // Arrange
    const code = "demo";

    // Act
    const path = stateFilePath(code, "F2");

    // Assert
    strictEqual(path, ".orkeon/dev/demo/state-F2.md");
  });

  it("names the batches' state file under Code's state folder", () => {
    // Arrange
    const code = "demo";

    // Act
    const path = batchesStatePath(code);

    // Assert
    strictEqual(path, ".orkeon/dev/demo/batches-state.md");
  });
});

describe("the steps of a sheet", () => {
  it("keeps the steps with a TDD line", () => {
    // Arrange
    const sheet = parseBatchSheet(F2);

    // Act
    const steps = sheetStateSteps(sheet);

    // Assert
    deepStrictEqual(steps.map((s) => [s.label, s.tdd, s.open]), [
      ["Step 1 — Print the batches of a plan with their state", "RED [x] GREEN [ ] COST [ ]", true],
      ["Step 2 — Refuse a code that is not a plain folder name", "RED [ ] GREEN [ ] COST [ ]", true],
    ]);
  });

  it("finds the first open one", () => {
    // Arrange
    const steps = stateFacts().steps;

    // Act
    const first = firstOpenStep(steps);

    // Assert
    strictEqual(first, "Step 1 — Print the batches of a plan with their state");
  });

  it("finds no open one when every step is closed", () => {
    // Arrange
    const steps = stateFacts().steps.map((s) => ({ ...s, open: false }));

    // Act
    const first = firstOpenStep(steps);

    // Assert
    strictEqual(first, null);
  });
});

describe("renderStateFile", () => {
  it("writes the header, the steps, the first open step, the events, the reports and the tree", () => {
    // Arrange
    const facts = stateFacts();

    // Act
    const text = renderStateFile(facts);

    // Assert
    ok(text.startsWith("# State of batch F2 of demo — written at 2026-10-24T10:00:00Z before a manual compaction\n"));
    assertMentions(text, STATE_MENTIONS);
  });

  it("says when nothing is open, nothing happened, and the tree is clean", () => {
    // Arrange
    const facts = stateFacts({ steps: [], events: [], reports: [], tree: { lines: [] } });

    // Act
    const text = renderStateFile(facts);

    // Assert
    assertMentions(text, EMPTY_MENTIONS);
    strictEqual(text.match(/\(none\)/g)?.length, 2);
  });

  it("cuts the tree, saying so", () => {
    // Arrange
    const facts = stateFacts({ tree: { lines: MANY_TREE_LINES } });

    // Act
    const text = renderStateFile(facts);

    // Assert
    ok(text.includes(`?? f${MAX_TREE_LINES - 1}\n\`\`\`\n(2 more line(s) left out)`));
    ok(!text.includes(`?? f${MAX_TREE_LINES}\n`));
  });

  it("carries why git gave no tree", () => {
    // Arrange
    const facts = stateFacts({ tree: { note: "git status failed: fatal" } });

    // Act
    const text = renderStateFile(facts);

    // Assert
    ok(text.includes("(git status failed: fatal)"));
  });

  it("bounds a long step title", () => {
    // Arrange
    const title = `Step 1 — ${LONG}`;

    // Act
    const label = boundLine(title);

    // Assert
    strictEqual(label.length, MAX_STATE_LINE_CHARS);
  });

  it("bounds a long event line and the number of events", () => {
    // Arrange
    const facts = stateFacts({ steps: longSteps(), events: MANY_EVENTS });

    // Act
    const text = renderStateFile(facts);

    // Assert
    ok(text.includes("(5 earlier line(s) left out)"));
    ok(!text.includes("F2 launched 4\n") && text.includes("F2 launched 5\n"));
    ok(text.split("\n").every((l) => l.length <= MAX_STATE_LINE_CHARS + 40), "no line runs unbounded");
  });
});
