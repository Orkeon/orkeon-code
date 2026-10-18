// The code-review use case over the fakes of its ports. Run:
//   node --test src/crews/code-review/application/run-code-review.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import { REVIEW_PROGRESS_LABEL, runCodeReview } from "./run-code-review.ts";
import { FINDINGS_SCHEMA, buildLensPrompt } from "./prompts.ts";
import { LENSES, describeReviewPlan } from "../domain/lenses.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { CONFIG_MAP_STATE_KEY, PASSES_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { dedupAndRank } from "../../../shared/domain/severity.ts";
import type { Finding } from "../../../shared/domain/types.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

const REPORT = "/output/code-review-report.md";
const DIFF = "diff --git a/x.ts b/x.ts\n+bad()\n";
const HIGH: Finding = { severity: "high", file: "x.ts", line: 2, finding: "bad call" };
const LOW: Finding = { severity: "low", file: "y.ts", line: 1, finding: "nit" };

function setup() {
  const shell = new FakeShell();
  const files = new FakeFiles();
  const progress = new FakeProgress();
  const session = new FakeSessionStore();
  const llm = new FakeLlm();
  llm.extractions = [{ findings: [] }];
  const log = new FakeLogger();
  const deps = { shell, files, progress, session, config: createConfigStore({ files, session }), llm, log };
  return { shell, files, progress, session, llm, log, deps };
}

const lens = (key: string) => LENSES.find((l) => l.key === key)!;

describe("runCodeReview — nothing to review", () => {
  it("reports an empty staged diff without reviewing", async () => {
    const { shell, llm, progress, log, deps } = setup();
    strictEqual(await runCodeReview({}, deps), "No changes to review (empty diff).");
    deepStrictEqual(shell.commands, ["git diff --staged"]);
    deepStrictEqual(llm.extracts, []);
    deepStrictEqual(progress.reports, []);
    deepStrictEqual(log.lines, ["info: reviewing staged changes"]);
  });

  it("names the paths whose diff is empty", async () => {
    const { deps } = setup();
    strictEqual(await runCodeReview({ files: ["src/a.ts"] }, deps), "No changes to review in the named path(s): src/a.ts.");
  });

  it("refuses an implausible commit and reviews the staged changes instead", async () => {
    const { shell, log, deps } = setup();
    await runCodeReview({ commit: "abc; rm -rf /" }, deps);
    deepStrictEqual(shell.commands, ["git diff --staged"]);
    ok(log.lines[0].startsWith("warn: review input refused: 'abc; rm -rf /' — "), log.lines[0]);
    strictEqual(log.lines[1], "info: reviewing staged changes");
  });
});

describe("runCodeReview — a review", () => {
  it("runs each pass over the input's lenses, ranks the findings and writes the report", async () => {
    const { shell, files, progress, session, llm, log, deps } = setup();
    shell.results["git diff abc123~1..abc123"] = { stdout: DIFF };
    shell.results["git diff abc123~1..abc123 --name-only"] = { stdout: "x.ts\ny.ts\n" };
    session.state.set(PASSES_STATE_KEY, "2");
    // Pass 1: security finds HIGH, style fails; pass 2: security finds LOW, style answers nothing.
    llm.extractions = [{ findings: [HIGH] }, new Error("not JSON"), { findings: [LOW] }, null];

    const out = await runCodeReview({ commit: "abc123", lenses: ["security", "nonsense", "style"] }, deps);

    const lenses = [lens("security"), lens("style")];
    const plan = describeReviewPlan(lenses, 2, "input");
    const findings = dedupAndRank([
      { lens: "security", findings: [HIGH] }, { lens: "style", findings: [] },
      { lens: "security", findings: [LOW] }, { lens: "style", findings: [] },
    ]);
    strictEqual(out, `${REPORT} (${findings.length} findings across 2 files, ${plan})`);
    deepStrictEqual(llm.extracts, [
      { prompt: buildLensPrompt(lenses[0], DIFF, 1, []), schema: FINDINGS_SCHEMA },
      { prompt: buildLensPrompt(lenses[1], DIFF, 1, []), schema: FINDINGS_SCHEMA },
      { prompt: buildLensPrompt(lenses[0], DIFF, 2, dedupAndRank([{ lens: "security", findings: [HIGH] }])), schema: FINDINGS_SCHEMA },
      { prompt: buildLensPrompt(lenses[1], DIFF, 2, dedupAndRank([{ lens: "security", findings: [HIGH] }])), schema: FINDINGS_SCHEMA },
    ]);
    deepStrictEqual(files.writes.map((w) => w.path), [REPORT]);
    ok(files.writes[0].content.includes("bad call"), files.writes[0].content);
    deepStrictEqual(progress.reports.map((r) => [r.label, r.step, r.total, r.message]), [
      [REVIEW_PROGRESS_LABEL, 1, 2, "pass 1 — security/style"],
      [REVIEW_PROGRESS_LABEL, 2, 2, "pass 2 — security/style"],
    ]);
    deepStrictEqual(progress.released, [REVIEW_PROGRESS_LABEL]);
    deepStrictEqual(log.lines, [
      "info: reviewing commit abc123~1..abc123",
      "warn: unknown review lens 'nonsense' ignored (valid: correctness, security, style)",
      `info: review plan — ${plan}`,
      "info: review pass 1/2: 1 raw finding(s)",
      "info: review pass 2/2: 1 raw finding(s)",
    ]);
  });

  it("takes the lenses from review.lenses when the input names none", async () => {
    const { shell, session, llm, deps } = setup();
    shell.results["git diff --staged"] = { stdout: DIFF };
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "review.lenses": "correctness" }));
    const out = await runCodeReview({}, deps);
    strictEqual(llm.extracts.length, 1);
    ok(out.endsWith(`, ${describeReviewPlan([lens("correctness")], 1, "config")})`), out);
  });

  it("runs one pass of every lens when the settings cannot be read", async () => {
    const { shell, session, llm, deps } = setup();
    shell.results["git diff --staged"] = { stdout: DIFF };
    session.failure = new Error("no session tools");
    await runCodeReview({}, deps);
    deepStrictEqual(llm.extracts.map((e) => e.prompt), LENSES.map((l) => buildLensPrompt(l, DIFF, 1, [])));
  });
});
