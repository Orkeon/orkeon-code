// runDevVerify over FakeFiles, FakeShell, FakeLlm and a config store on FakeFiles: a
// demo plan folder whose gate is green, then each outcome of the command - red gate,
// --gate-only, VALID, GAPS, BLOCKED, resume, the refusals, full. Run:
//   node --test src/crews/dev-verify/application/run-dev-verify.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { scriptToolSlot } from "../../../shared/application/dev/script-tool-slot.ts";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../../tests/doubles/fake-precedents.ts";
import { GIT_DIFF_CHECK } from "../domain/commands.ts";
import type { ValidationRunner } from "./audit.ts";
import { runDevVerify } from "./run-dev-verify.ts";
import { assertBefore, assertMentions, assertOmits } from "./run-dev-verify.assertions.ts";
import {
  COST_LINE, DIR, EARLIER, GATE_ONLY_LINE, GREEN_LINE, MAJOR, MEASURED, MINOR, PACK, REFUSAL_CASES, SHEET, TARGET,
  UNFINISHED, VALIDATION, VERDICT, HARVEST_LINE, answer, countingHarvest, failVerdictWrite, measuringCostIndex,
  planOutsideWorkFolder, recordingHarvest, run, runValidationOnAct, setup,
} from "./run-dev-verify.fixtures.ts";

describe("runDevVerify — the gate", () => {
  it("returns the gate lines and calls no model when the gate is red", async () => {
    // Arrange
    const f = setup();
    f.shell.results[GIT_DIFF_CHECK] = { exitCode: 2 };

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    ok(text.endsWith("GATE — batch F2: RED — fix and run again, no audit before"), text);
    ok(text.startsWith(`${TARGET}\n`), text);
    strictEqual(f.llm.acts.length, 0);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("stops after a green gate under --gate-only: no model call, no write", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await run(f.deps, { batch: "F2", plan: "demo", gateOnly: true });

    // Assert
    const lines = text.split("\n");
    strictEqual(lines.at(-1), GATE_ONLY_LINE);
    strictEqual(lines.at(-2), GREEN_LINE);
    strictEqual(f.llm.acts.length + f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });
});

describe("runDevVerify — the verdict", () => {
  it("writes a VALID verdict and returns the lines of the outcome", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith("# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast\n\n## Verdict — VALID\n"), written);
    deepStrictEqual(text.split("\n"), [
      TARGET,
      GREEN_LINE,
      COST_LINE,
      ...written.trimEnd().split("\n"),
      "written: workbench/demo/DEMO-VERIFY-F2.md — capture: workbench/demo/capture-F2/",
      "→ Batch F2 VALID. The close commits the batch's files: /dev-implement F2 <code> --close " +
        "(run by itself when /dev-implement launched this audit).",
      "  files: src/a.ts, tests/a.test.ts",
    ]);
    strictEqual(f.llm.acts.length, 1);
  });

  it("binds the run_validation tool's slot for the audit, cites the run the auditor made through it, then releases it", async () => {
    // Arrange
    const f = setup();
    const slot = scriptToolSlot<ValidationRunner>();
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "# pass 3\n# fail 0\n" };
    const reports = runValidationOnAct(f.llm, slot, VALIDATION);
    f.llm.answers = ["the test ran green"];
    f.llm.extractions = [answer([MINOR])];

    // Act
    await runDevVerify({ batch: "F2" }, { ...f.deps, validationSlot: slot });

    // Assert
    deepStrictEqual(reports, [{ command: VALIDATION, outcome: "exit 0", tail: "# pass 3\n# fail 0" }]);
    strictEqual(f.llm.acts.length, 1);
    strictEqual(f.shell.commands.filter((c) => c === VALIDATION).length, 1);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.includes(`\`${VALIDATION}\` — exit 0`), written);
    strictEqual(slot.get(), undefined);
  });

  it("writes GAPS with a Blocking Test row when a validation code ran is red, whatever the auditor answers", async () => {
    // Arrange
    const f = setup();
    f.shell.results[VALIDATION] = { exitCode: 1, stdout: "# pass 1\n# fail 2\n" };
    f.llm.answers = ["I doubt a.test.ts", "all good"];
    f.llm.extractions = [answer([], [VALIDATION]), { verdict: "VALID", rows: [], validations: [] }];

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    assertMentions(f.files.files.get(VERDICT) ?? "", [
      "## Verdict — GAPS",
      `| Blocking | Test | a validation is red: exit 1, 2 failed | \`${VALIDATION}\` exit 1, 2 failed, run by /dev-verify |`,
    ]);
    ok(!text.includes("→ Batch F2 VALID."), text);
  });

  it("prints the Cost line the code index measures, and writes it in the capture", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    const { costIndex, asked } = measuringCostIndex();

    // Act
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, costIndex });

    // Assert
    deepStrictEqual(text.split("\n").slice(1, 3), [GREEN_LINE, MEASURED]);
    deepStrictEqual(asked, ["/workspace/src/a.ts"]);
    strictEqual(f.files.files.get(`${DIR}/capture-F2/cost.txt`),
      `exit: 0\n[src/a.ts::show]\nPorts outside loops (1): this.store.load L2\n${MEASURED}\n`);
    assertMentions(f.files.files.get(`${DIR}/capture-F2/table.md`) ?? "", [`| Cost | capture \`cost\` | ok | \`exit: 0\` — ${MEASURED} |`]);
  });

  it("points a GAPS verdict at the correction of its first row", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MINOR, MAJOR])];

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    const lines = text.split("\n");
    ok(lines.includes("## Verdict — GAPS"), text);
    deepStrictEqual(lines.slice(-2), [
      "→ /dev-implement F2 — correction: Major Reuse: parses dates by hand",
      "  it appends the gap to the sheet as a new step and runs it; the audit follows by itself (/dev-verify F2 resume)",
    ]);
  });

  it("T4: recalls mistakes from the sheet's title and the changed code paths, the block in the auditor's brief", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MAJOR])];
    const precedents = FakePrecedents.hits();

    // Act
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, precedents: precedents.recall });

    // Assert
    deepStrictEqual(precedents.calls, [{ trigger: "T4", query: "DEMO-PLAN-F2 — Command — src/a.ts — tests/a.test.ts" }]);
    assertBefore(f.llm.acts[0].prompt, PRECEDENTS_SAMPLE, "The mechanical table (table.md):");
    ok(text.split("\n").includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("carries the sheet's text in the auditor's brief, before the capture", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];

    // Act
    await runDevVerify({ batch: "F2" }, f.deps);

    // Assert
    const brief = f.llm.acts[0].prompt;
    assertMentions(brief, [`The sheet, in this brief (do not open it again):\n\`\`\`text\n${SHEET.trimEnd()}\n\`\`\``]);
    assertBefore(brief, "The sheet, in this brief", "The capture, in this brief");
  });

  it("T4: no block and no line when nothing is recalled", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];

    // Act
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, precedents: new FakePrecedents().recall });

    // Assert
    assertOmits(f.llm.acts[0].prompt, ["## Precedents"]);
    assertOmits(text, ["precedents recalled"]);
  });

  it("M-7: after a GAPS verdict written, the harvest's lines close the message", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MAJOR])];
    const { harvest, seen } = recordingHarvest(f.files);

    // Act
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, harvest });

    // Assert
    deepStrictEqual(seen, [{ folder: "workbench", verdict: true }]);
    strictEqual(text.split("\n").at(-1), HARVEST_LINE);
  });

  it("M-7: a VALID verdict harvests nothing", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([MINOR])];
    const { harvest, calls } = countingHarvest();

    // Act
    await runDevVerify({ batch: "F2" }, { ...f.deps, harvest });

    // Assert
    strictEqual(calls.count, 0);
  });

  it("warns when the auditor's verdict differs from the one its rows make, and keeps the rows' verdict", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [{ ...answer([MAJOR]), verdict: "VALID" }];

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    ok(text.split("\n").includes("## Verdict — GAPS"), text);
    ok(f.deps.log.lines.includes("warn: the auditor said VALID; the rows make it GAPS"), f.deps.log.lines.join("\n"));
  });

  it("does not warn when the auditor's verdict is the one its rows make", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["gaps"];
    f.llm.extractions = [answer([MAJOR])];

    // Act
    await run(f.deps, { batch: "F2" });

    // Assert
    ok(!f.deps.log.lines.some((l) => l.startsWith("warn: the auditor said")), f.deps.log.lines.join("\n"));
  });

  it("is BLOCKED, writing no verdict, when the answer does not parse after one re-ask", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["rambling"];
    f.llm.extractions = [{ verdict: "PERHAPS" }];

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    deepStrictEqual(text.split("\n").slice(-3), [
      GREEN_LINE,
      COST_LINE,
      "dev-verify: BLOCKED — the auditor's answer did not parse after one re-ask (verdict must be VALID or GAPS): " +
        "its replies are in workbench/demo/capture-F2/auditor-replies.txt; no verdict written",
    ]);
    strictEqual(f.files.files.has(VERDICT), false);
    ok(f.files.files.has(`${DIR}/capture-F2/auditor-replies.txt`));
  });

  it("writes a GAPS verdict that says the audit did not finish when the budget runs out after a validation", async () => {
    // Arrange
    const f = setup();
    const slot = scriptToolSlot<ValidationRunner>();
    f.shell.results[VALIDATION] = { exitCode: 0, stdout: "# pass 3\n# fail 0\n" };
    runValidationOnAct(f.llm, slot, VALIDATION);
    f.llm.answers = [new Error("Token budget exhausted (307528/300000).")];

    // Act
    const text = await runDevVerify({ batch: "F2" }, { ...f.deps, validationSlot: slot });

    // Assert
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith("# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast\n\n## Verdict — GAPS\n"), written);
    assertMentions(written, [
      "| Blocking | Correctness | the audit did not finish: the step's budget ran out | " +
        "tokens: Token budget exhausted (307528/300000). — workbench/demo/capture-F2/auditor-replies.txt |",
      `Validations: \`${VALIDATION}\` — exit 0`,
    ]);
    ok(f.files.files.get(`${DIR}/capture-F2/validations.txt`)?.startsWith(`$ ${VALIDATION}\nexit 0`));
    strictEqual(text.split("\n").at(-1),
      "dev-verify: BLOCKED — the step's budget is spent (tokens: Token budget exhausted (307528/300000).): the capture " +
        "stays in workbench/demo/capture-F2/; GAPS written to workbench/demo/DEMO-VERIFY-F2.md: the audit did not finish");
    assertOmits(text, ["correction:"]);
  });

  it("is BLOCKED when the verdict cannot be written", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];
    failVerdictWrite(f.files);

    // Act
    const text = await run(f.deps, { batch: "F2" });

    // Assert
    ok(text.endsWith("dev-verify: BLOCKED — workbench/demo/DEMO-VERIFY-F2.md cannot be written (read-only mount)"), text);
  });
});

describe("runDevVerify — resume", () => {
  it("hands the previous gaps to the auditor and appends a dated section", async () => {
    // Arrange
    const f = setup();
    f.files.files.set(VERDICT, EARLIER);
    f.llm.answers = ["fixed now"];
    f.llm.extractions = [answer([])];

    // Act
    await run(f.deps, { batch: "F2", mode: "resume" });

    // Assert
    assertMentions(f.llm.acts[0].prompt, ["- Major · Reuse · parses dates by hand · evidence: src/a.ts:9 · fix: call the parser"]);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith(EARLIER.trimEnd()), written);
    assertMentions(written, ["\n\n# DEMO-VERIFY-F2 — 2026-10-22 14:05 — resume\n\n## Verdict — VALID\n"]);
  });

  it("after an audit the budget stopped, resumes the gaps of the last audit that finished", async () => {
    // Arrange
    const f = setup();
    f.files.files.set(VERDICT, `${EARLIER}\n${UNFINISHED}`);
    f.llm.answers = ["fixed now"];
    f.llm.extractions = [answer([])];

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "resume" });

    // Assert
    assertMentions(text, ["resume: the last audit did not finish — the gaps of the audit of 2026-10-21 09:40 are resumed"]);
    assertMentions(f.llm.acts[0].prompt, ["Scope: the previous gaps and what changed since.", "- Major · Reuse · parses dates by hand"]);
  });

  it("after an audit the budget stopped and none finished, audits the whole batch and appends", async () => {
    // Arrange
    const f = setup();
    f.files.files.set(VERDICT, UNFINISHED);
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "resume" });

    // Assert
    assertMentions(text, ["resume: no audit of this batch finished — the whole batch is audited (fast), the section appended"]);
    assertMentions(f.llm.acts[0].prompt, ["Scope: the whole batch."]);
    assertOmits(f.llm.acts[0].prompt, ["The previous gaps:"]);
    const written = f.files.files.get(VERDICT) ?? "";
    ok(written.startsWith(UNFINISHED.trimEnd()), written);
    assertMentions(written, ["\n\n# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast\n\n## Verdict — VALID\n"]);
  });

  it("audits the whole batch when the verdict file holds no section that parses", async () => {
    // Arrange
    const f = setup();
    f.files.files.set(VERDICT, "");
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "resume" });

    // Assert
    assertMentions(text, ["resume: no audit of this batch finished — the whole batch is audited (fast), the section appended"]);
    assertMentions(f.llm.acts[0].prompt, ["Scope: the whole batch."]);
    assertOmits(f.llm.acts[0].prompt, ["Scope: the previous gaps"]);
  });

  it("runs resume --gate-only without an earlier verdict", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "resume", gateOnly: true });

    // Assert
    strictEqual(text.split("\n").at(-1), GATE_ONLY_LINE);
    deepStrictEqual(f.files.writes, []);
  });

  it("refuses resume without an earlier verdict", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "resume" });

    // Assert
    strictEqual(text.split("\n").at(-1), "dev-verify: resume needs workbench/demo/DEMO-VERIFY-F2.md: run /dev-verify F2 first");
    strictEqual(f.llm.acts.length, 0);
  });
});

describe("runDevVerify — refusals", () => {
  for (const c of REFUSAL_CASES) {
    it(c.name, async () => {
      // Arrange
      const f = setup();
      c.arrange(f);

      // Act
      const text = await run(f.deps, c.input);

      // Assert
      strictEqual(text, c.expected);
    });
  }

  it("resolves a plan path to its folder", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await run(f.deps, { batch: "F2", plan: "/workspace/workbench/demo/DEMO-PLAN.md", gateOnly: true });

    // Assert
    ok(text.endsWith(GATE_ONLY_LINE), text);
  });

  it("refuses a plan path outside the work folder, where the capture and the verdict would be written", async () => {
    // Arrange
    const f = setup();
    planOutsideWorkFolder(f);

    // Act
    const text = await run(f.deps, { batch: "F2", plan: ".claude/x/X-PLAN.md" });

    // Assert
    strictEqual(text, "dev-verify: '.claude/x/X-PLAN.md' is not under the work folder workbench/");
    strictEqual(f.files.files.has("/workspace/.claude/x/X-VERIFY-F2.md"), false);
  });
});

describe("runDevVerify — full", () => {
  it("runs commands.test with 900 s first, and a red suite is a Blocking Test row", async () => {
    // Arrange
    const f = setup();
    f.shell.results["npm test"] = { exitCode: 1, stdout: "ℹ pass 40\nℹ fail 2\n" };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    const text = await run(f.deps, { batch: "F2", mode: "full" });

    // Assert
    deepStrictEqual(f.shell.calls.find((c) => c.command === "npm test"),
      { command: "npm test", options: { timeoutSeconds: 900 } });
    assertMentions(f.llm.acts[0].prompt, ["- command: npm test"]);
    assertMentions(f.files.files.get(VERDICT) ?? "", [
      "## Verdict — GAPS",
      "| Blocking | Test | the whole fast suite is red: exit 1, 2 failed |",
      "Validations: whole fast suite — exit 1\n",
    ]);
    assertMentions(text, ["→ /dev-implement F2 — correction: Blocking Test: the whole fast suite is red: exit 1, 2 failed"]);
  });

  it("adds a Major Test row when the whole suite times out", async () => {
    // Arrange
    const f = setup();
    f.shell.results["npm test"] = { timedOut: true, exitCode: -1 };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    await run(f.deps, { batch: "F2", mode: "full" });

    // Assert
    assertMentions(f.files.files.get(VERDICT) ?? "", [
      "## Verdict — GAPS",
      "| Major | Test | the whole fast suite did not finish within 900 s |",
      "Not run: `npm test` — timed out after 900 s",
    ]);
  });

  it("words a missing exit code as none reported, never exit -1", async () => {
    // Arrange
    const f = setup();
    f.shell.results["npm test"] = { exitCode: -1, stdout: "" };
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    await run(f.deps, { batch: "F2", mode: "full" });

    // Assert
    const written = f.files.files.get(VERDICT) ?? "";
    assertMentions(written, [
      "| Blocking | Test | the whole fast suite is red: no exit code reported |",
      "Validations: whole fast suite — no exit code reported\n",
    ]);
    assertOmits(written, ["exit -1"]);
  });

  it("says Not run when the pack has no commands.test", async () => {
    // Arrange
    const f = setup();
    f.files.files.set("/workspace/.orkeon/repo.yaml", PACK.replace("  test: npm test\n", ""));
    f.llm.answers = ["fine"];
    f.llm.extractions = [answer([])];

    // Act
    await run(f.deps, { batch: "F2", mode: "full" });

    // Assert
    assertMentions(f.files.files.get(VERDICT) ?? "", ["Not run: commands.test — the pack has none"]);
  });
});
