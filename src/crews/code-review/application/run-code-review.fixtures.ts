// The ports of the code-review use case, their fakes wired, and the review it is expected to run.
import { REVIEW_PROGRESS_LABEL } from "./run-code-review.ts";
import { FINDINGS_SCHEMA, buildLensPrompt } from "./prompts.ts";
import { LENSES, type ReviewLens } from "../domain/lenses.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { dedupAndRank } from "../../../shared/domain/severity.ts";
import type { Finding } from "../../../shared/domain/types.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeProgress } from "../../../../tests/support/fake-progress.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";

export const REPORT = "/output/code-review-report.md";
export const DIFF = "diff --git a/x.ts b/x.ts\n+bad()\n";
export const HIGH: Finding = { severity: "high", file: "x.ts", line: 2, finding: "bad call" };
export const LOW: Finding = { severity: "low", file: "y.ts", line: 1, finding: "nit" };

/** The fakes of every port, an LLM that finds nothing, and the deps built on them. */
export function reviewHarness() {
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

/** The lens of `key`. */
export const lens = (key: string): ReviewLens => LENSES.find((l) => l.key === key)!;

/** What a two-pass review over security and style, with HIGH then LOW found by security, is expected to do. */
export function twoPassReview() {
  const lenses = [lens("security"), lens("style")];
  const plan = Object.freeze({ lenses, passes: 2, source: "input" as const });
  const findings = dedupAndRank([
    { lens: "security", findings: [HIGH] }, { lens: "style", findings: [] },
    { lens: "security", findings: [LOW] }, { lens: "style", findings: [] },
  ]);
  const prior = dedupAndRank([{ lens: "security", findings: [HIGH] }]);
  const extracts = [
    { prompt: buildLensPrompt(lenses[0], DIFF, 1, []), schema: FINDINGS_SCHEMA },
    { prompt: buildLensPrompt(lenses[1], DIFF, 1, []), schema: FINDINGS_SCHEMA },
    { prompt: buildLensPrompt(lenses[0], DIFF, 2, prior), schema: FINDINGS_SCHEMA },
    { prompt: buildLensPrompt(lenses[1], DIFF, 2, prior), schema: FINDINGS_SCHEMA },
  ];
  const progress = [
    [REVIEW_PROGRESS_LABEL, 1, 2, "pass 1 — security/style"],
    [REVIEW_PROGRESS_LABEL, 2, 2, "pass 2 — security/style"],
  ];
  return { ...plan, findings, extracts, progress };
}

/** The log of that review, its plan line given. */
export function twoPassLog(plan: string): string[] {
  return [
    "info: reviewing commit abc123~1..abc123",
    "warn: unknown review lens 'nonsense' ignored (valid: correctness, security, style)",
    `info: review plan — ${plan}`,
    "info: review pass 1/2: 1 raw finding(s)",
    "info: review pass 2/2: 1 raw finding(s)",
  ];
}
