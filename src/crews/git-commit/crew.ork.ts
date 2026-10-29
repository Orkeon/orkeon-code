// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// GitCommit crew (/commit) — exp 07 SPEC §4.3. Composition root of
// application/run-git-commit: it wires the ports and delegates the whole flow.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
// Via REPL:        /commit  →  script-host.runCrewAsync("git-commit", {})

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

const ports = { shell: orkeonShell(), files: orkeonFiles(), config: orkeonConfigStore() };

const committer = orkeonAgent()
  .name("git-committer")
  .role("Commit Writer")
  .goal("Inspect the working tree, draft a Conventional-Commits message, and commit safely.")
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
