// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// CodeReview crew (/review) — exp 07 SPEC §4.4. Composition root: it builds the
// agent and wires application/run-code-review, which collects the staged diff,
// runs three review lenses (correctness/security/style) in parallel via
// Promise.all, dedups + ranks findings, and writes /output/code-review-report.md.
//
// Input (globalThis.inputs): { files?: string[], commit?: string, lenses?: string, passes?: number }
//   files  — repo-relative paths restricting the diff (B-3; honoured since then)
//   commit — review that commit instead of the staged changes
//   lenses — the lenses of this run, outranking review.lenses (/review --lens, /security-review)
//   passes — the rounds of this run, outranking the session's /passes (/review --passes)
// Run standalone:  bash scripts/run-crew.sh src/crews/code-review/crew.ork.ts

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import {
  orkeonConfigStore, orkeonFiles, orkeonProgress, orkeonSessionIo, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runCodeReview } from "./application/run-code-review.ts";

const ports = {
  shell: orkeonShell(),
  files: orkeonFiles(),
  progress: orkeonProgress(),
  session: orkeonSessionIo(),
  config: orkeonConfigStore(),
};

const reviewer = AgentBuilder()
  .name("code-reviewer")
  .role("Senior Code Reviewer")
  .goal("Review changes across correctness, security, and style lenses and produce a ranked report.")
  .tools(["shell_command", "file_read"])
  .body(async (_input: any, ctx: any) =>
    await runCodeReview(inputs(), { ...ports, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("code-review")
    .process("sequential")
    .withAgent(reviewer)
    .build(),
);
