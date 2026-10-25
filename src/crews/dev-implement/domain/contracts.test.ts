// The RED and GREEN briefs made by code. Run:
//   node --test src/crews/dev-implement/domain/contracts.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { CARRIED_CONTRACT_CHARS, classOf, greenContract, redContract, stubsOf, testCommandFor } from "./contracts.ts";
import {
  ASSUMPTION_SAYS, contractInput, GREEN_CARRIED_SAYS, GREEN_SAYS, LAYOUT, laterStep, pastTheRoom, RED_CARRIED_SAYS, RED_SAYS, SHEET,
  SHEET_AND_TEST_CARRIED, STUB_CARRIED, stepCreating, stepWithStubs, stepWithTestFile, STUBS_SAY,
} from "./contracts.fixtures.ts";
import { assertCarriedBeforeRules, assertMentions, assertNodeRules } from "./contracts.assertions.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("testCommandFor", () => {
  it("fills test_class with the test file for a script", () => {
    // Arrange
    const commands = { testClass: "node --test <Class>" };

    // Act
    const command = testCommandFor(commands, SHEET.steps[0]);

    // Assert
    deepStrictEqual(command, { ok: true, command: "node --test src/shared/domain/memory-prune.test.ts" });
  });

  it("takes a C# test file's base name as its class", () => {
    // Arrange
    const testFile = "tests/Unit/PruneTests.cs";

    // Act
    const name = classOf(testFile);

    // Assert
    strictEqual(name, "PruneTests");
  });

  it("fills the project and the class of a .NET template", () => {
    // Arrange
    const step = stepWithTestFile(SHEET.steps[0], "tests/Unit/PruneTests.cs", "to create");

    // Act
    const command = testCommandFor({ testClass: "dotnet test <test project> --no-build --filter FullyQualifiedName~<Class>" }, step);

    // Assert
    deepStrictEqual(command, { ok: true, command: "dotnet test src/shared/domain --no-build --filter FullyQualifiedName~PruneTests" });
  });

  it("falls back on test_project", () => {
    // Arrange
    const commands = { testProject: "dotnet test <test project>" };

    // Act
    const command = testCommandFor(commands, SHEET.steps[0]);

    // Assert
    deepStrictEqual(command, { ok: true, command: "dotnet test src/shared/domain" });
  });

  it("refuses a pack with neither test_class nor test_project", () => {
    // Arrange
    const commands = { test: "npm test" };

    // Act
    const command = testCommandFor(commands, SHEET.steps[0]);

    // Assert
    strictEqual(command.ok, false);
  });
});

describe("redContract / greenContract", () => {
  it("names the ids, the tests, the files and the rules of the test author", () => {
    // Arrange
    const input = contractInput();

    // Act
    const red = redContract(input);

    // Assert
    assertMentions(red, RED_SAYS);
  });

  it("keeps an assumption for a behaviour the plan leaves open, never a test value: the test author", () => {
    // Arrange
    const input = contractInput();

    // Act
    const red = redContract(input);

    // Assert
    assertMentions(red, ASSUMPTION_SAYS);
  });

  it("keeps an assumption for a behaviour the plan leaves open, never a test value: the implementer", () => {
    // Arrange
    const input = contractInput();

    // Act
    const green = greenContract(input, { tail: "", log: null });

    // Assert
    assertMentions(green, ASSUMPTION_SAYS);
  });

  it("asks the test author to read and edit by node, file_write for a new file only", () => {
    // Arrange
    const input = contractInput();

    // Act
    const red = redContract(input);

    // Assert
    assertNodeRules(red);
  });

  it("asks the implementer to read and edit by node, file_write for a new file only", () => {
    // Arrange
    const input = contractInput();

    // Act
    const green = greenContract(input, { tail: "", log: null });

    // Assert
    assertNodeRules(green);
  });

  it("asks the test author to add to an existing test file by node, never rewrite it whole", () => {
    // Arrange
    const kept = stepWithTestFile(SHEET.steps[1], "tests/old.test.ts", "existing");

    // Act
    const red = redContract(contractInput({ step: kept }));

    // Assert
    ok(red.includes("add the tests with node_insert inside its suite, never rewrite it whole"));
  });

  it("asks the test author to create a new test file with file_write, then add to it by node", () => {
    // Arrange
    const fresh = stepWithTestFile(SHEET.steps[1], "tests/new.test.ts", "to create");

    // Act
    const red = redContract(contractInput({ step: fresh }));

    // Assert
    ok(red.includes("`tests/new.test.ts` — to create — create it with file_write; once it exists, add to it by node"));
  });

  it("gives the implementer the red run, the elements, the expected cost and the Cost line to answer", () => {
    // Arrange
    const input = contractInput();

    // Act
    const green = greenContract(input, { tail: "not ok 1", log: `${WORKSPACE}/workbench/prune/logs/x.log` });

    // Assert
    assertMentions(green, GREEN_SAYS);
  });

  it("carries the sheet and the test file in the RED brief, before its rules, and says not to open them", () => {
    // Arrange
    const input = contractInput({ step: laterStep(), carried: SHEET_AND_TEST_CARRIED });

    // Act
    const red = redContract(input);

    // Assert
    assertMentions(red, RED_CARRIED_SAYS);
    assertCarriedBeforeRules(red);
  });

  it("carries the test file in the GREEN brief, before its rules, read only", () => {
    // Arrange
    const input = contractInput({ step: laterStep(), carried: SHEET_AND_TEST_CARRIED });

    // Act
    const green = greenContract(input, { tail: "not ok 1", log: null });

    // Assert
    assertMentions(green, GREEN_CARRIED_SAYS);
    assertCarriedBeforeRules(green);
  });

  it("names the test file read only in a GREEN brief that does not carry it", () => {
    // Arrange
    const input = contractInput({ step: laterStep() });

    // Act
    const green = greenContract(input, { tail: "not ok 1", log: null });

    // Assert
    ok(green.includes("Test file (read only): `tests/prune.test.ts`."));
  });

  it("has no carried section in a brief that carries nothing", () => {
    // Arrange
    const input = contractInput();

    // Act
    const red = redContract(input);

    // Assert
    ok(!red.includes("## In this brief"));
  });

  it("cuts a carried text past the room", () => {
    // Arrange
    const input = contractInput({ carried: [{ title: "big", text: "x".repeat(CARRIED_CONTRACT_CHARS * 2) }] });

    // Act
    const cut = redContract(input);

    // Assert
    ok(cut.includes("more characters)"));
    ok(cut.length < CARRIED_CONTRACT_CHARS + 4_000, String(cut.length));
  });

  it("lets the test author stub the files the step creates", () => {
    // Arrange
    const step = stepWithStubs();

    // Act
    const stubs = stubsOf(step);

    // Assert
    deepStrictEqual(stubs, ["src/a.ts"]);
  });

  it("lets the test author stub the files the step creates, and a missing declaration in the existing ones", () => {
    // Arrange
    const step = stepWithStubs();

    // Act
    const red = redContract(contractInput({ step }));

    // Assert
    assertMentions(red, STUBS_SAY);
  });

  it("names the test files beside the code", () => {
    // Arrange
    const layout = { ...LAYOUT, tests: undefined, testFiles: ["src/*.test.ts"] };

    // Act
    const red = redContract(contractInput({ layout }));

    // Assert
    ok(red.includes("Write test files only (`src/*.test.ts`)"));
  });

  it("names a correction's finding", () => {
    // Arrange
    const correction = { ...SHEET.steps[1], title: "Correction C1 — the cut-off is inclusive" };

    // Act
    const red = redContract(contractInput({ step: correction }));

    // Assert
    ok(red.includes("A correction (C1) of an audit's finding: the cut-off is inclusive"));
  });

  it("names every step of a cycle", () => {
    // Arrange
    const input = contractInput({ step: SHEET.steps[0], cycle: [SHEET.steps[0], SHEET.steps[1]] });

    // Act
    const green = greenContract(input, { tail: "", log: null });

    // Assert
    assertMentions(green, ["steps 1, 2 (one behaviour)", `Step 2 — ${SHEET.steps[1].title}:`]);
  });
});

describe("what a contract says is in its brief", () => {
  it("shows the implementer a production file RED stubbed as existing and in the brief", () => {
    // Arrange
    const step = stepCreating(SHEET.steps[1], "tests/prune.test.ts", "src/prune.ts");

    // Act
    const green = greenContract(contractInput({ step, carried: STUB_CARRIED }), { tail: "not ok 1", log: null });

    // Assert
    ok(green.includes("- `src/prune.ts` — existing (stubbed at RED), in this brief"), green);
  });

  it("keeps a production file not carried as the sheet says it", () => {
    // Arrange
    const step = stepCreating(SHEET.steps[1], "tests/prune.test.ts", "src/prune.ts");

    // Act
    const green = greenContract(contractInput({ step }), { tail: "not ok 1", log: null });

    // Assert
    ok(green.includes("- `src/prune.ts` — to create\n"), green);
  });

  it("never says a test file cut past the room is in the brief", () => {
    // Arrange
    const step = stepCreating(SHEET.steps[1], "tests/prune.test.ts", "src/prune.ts");

    // Act
    const red = redContract(contractInput({ step, carried: pastTheRoom("tests/prune.test.ts") }));

    // Assert
    ok(red.includes("- test file: `tests/prune.test.ts` — to create — create it with file_write"), red);
  });
});
