// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// GitCommit crew (/commit) — exp 07 SPEC §4.3. Composition root of
// application/run-git-commit: it wires the ports and delegates the whole flow.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
// Via REPL:        /commit  →  script-host.runCrewAsync("git-commit", {})
//
// Input (threaded by /commit, commands/_lib/git/commit.ts):
//   permissionMode   the effective mode; absent or read-only, the crew refuses
//   paths            the paths named, or none for every change the status lists
//   push, pr         booleans (or "true"); pr implies the push
//   note             the author's reason for this commit (--note), absent when not given
//   githubTool, prAsked, permissionRules   what opening the pull request needs

import { CrewBuilder, publishCrew, inputs } from "../../shared/infrastructure/globals.ts";
import {
  orkeonAgent,
  orkeonConfigStore,
  orkeonFiles,
  orkeonPullRequestOpener,
  orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createCrewMemory } from "../../shared/infrastructure/orkeon/crew-memory.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runGitCommit } from "./application/run-git-commit.ts";
import { COMMITTER_GOAL, COMMITTER_ROLE } from "./application/prompts.ts";

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore() };

const committer = orkeonAgent()
  .name("git-committer")
  .role(COMMITTER_ROLE)
  .goal(COMMITTER_GOAL)
  .tools(["shell_command"])
  .body(async (_input: any, ctx: any) =>
    await runGitCommit(inputs(), {
      ...ports,
      llm: createLlm(ctx.llm),
      memory: createCrewMemory(ctx),
      log: ctx.log,
      openerFor: (policy) => orkeonPullRequestOpener(policy),
    }))
  .build();

publishCrew(
  CrewBuilder()
    .name("git-commit")
    .process("sequential")
    .withAgent(committer)
    .build(),
);
