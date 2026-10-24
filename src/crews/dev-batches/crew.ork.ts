// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// DevBatches crew (/dev-batches). Composition root: one agent, the reviewer's read tools, whose body is
// application/run-dev-batches: it reads the plan, its sheets, its verdicts and the log
// `.orkeon/dev/<code>/batches-state.md`, logs what came of the batch the chain just ran, then stops (a human
// decides), closes the plan (one push, one pull request) or names the next batch in the dependencies' order,
// after the preflight and, for a batch whose dependencies just closed, one review of its sheet (inline, read
// tools only). It launches nothing: a crew cannot (crew-host.ts), the command's `completed` does.
//
// Input (globalThis.inputs): { code?: string (absent: the run .orkeon/dev/batches-active.json names),
//                              pr?: boolean, after?: string[] (the last lines the batch's chain answered),
//                              concurrency?: 1 (default; above 1 refused until a script agent can be given a working root),
//                              permissionMode?, permissionRules?, githubTool?, hooks?, effort?, memoryRecall? }
// Answer: JSON { lines: string[], next?: { crew: "dev-implement", input } }, read by the command's completed.
// Run standalone:  bash scripts/run-crew.sh src/crews/dev-batches/crew.ork.ts --inputs '{"code":"prune"}'
//   (it logs the batch it names as launched and launches nothing: drive that batch with /dev-implement)
//
// Budget: domain/batches-budget.ts.

import { AgentBuilder, CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonFiles, orkeonPullRequestOpener, orkeonShell } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { memoryDirOf } from "../../shared/application/shared-memory/memory-settings.ts";
import { devToolCallbacks } from "../../shared/infrastructure/orkeon/tool-callbacks.ts";
import { charterCatalogue } from "../../shared/domain/agents/charter.ts";
import { providerEffort } from "../../shared/domain/agent-policy/behavior-flags.ts";
import { REVIEWER_CHARTER } from "../../shared/domain/dev/reviewer-charter.ts";
import { parseSessionRules } from "../../shared/domain/git/pull-request.ts";
import { BATCHES_BUDGET } from "./domain/batches-budget.ts";
import { runDevBatches } from "./application/run-dev-batches.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore() };
const effort = providerEffort(inputs().effort);

const builder = AgentBuilder()
  .name("dev-batches")
  .role("Batch driver")
  .goal("Run a plan's batches in the order their dependencies allow, one at a time, and close the plan with one pull request")
  // The reviewer's read tools, for the review of the next batch; the rest is code's.
  .tools(charterCatalogue(REVIEWER_CHARTER))
  .maxIterations(REVIEWER_CHARTER.maxIterations)
  .body(async (_input: any, ctx: any) => {
    return await runDevBatches(inputs(), {
      ...ports, log: ctx.log, clock: () => new Date(),
      // The host's gate first, then these callbacks: the dev rule sets again and the run's /hooks (a chained run
      // reads them from its record, as it does the /effort). The reviewer only reads: the plan step's guard fits it.
      reviewerFor: (c) => createLlm(ctx.llm, devToolCallbacks({ step: "dev-plan", hooks: c.hooks }, { shell: ports.shell, log: ctx.log, memoryDir: memoryDirOf(ports.config) }),
        { effort: providerEffort(c.effort ?? undefined) }),
      openerFor: (c) => orkeonPullRequestOpener({ mode: c.permissionMode, rules: parseSessionRules(c.permissionRules), asked: false }),
    });
  });
const driver = (effort === undefined ? builder : builder.effort(effort)).build();

publishCrew(
  CrewBuilder()
    .name("dev-batches")
    .process("sequential")
    .budget(BATCHES_BUDGET)
    .withAgent(driver)
    .build(),
);
