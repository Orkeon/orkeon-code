// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// ProjectInit crew (/init) — exp 07 SPEC §4.1. Composition root of application/run-project-init.
// Scans the workspace, detects build/test/lint conventions, writes AGENTS.md.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/project-init/crew.ork.ts

import { AgentBuilder, CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonFiles } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runProjectInit } from "./application/run-project-init.ts";

const files = orkeonFiles();

const scanner = AgentBuilder()
  .name("project-initialiser")
  .role("Repository Onboarding Engineer")
  .goal("Understand a codebase's layout + conventions and write an AGENTS.md that future agents can rely on.")
  .tools(["directory_read", "file_read", "codebase_map"])
  .body(async (_input: any, ctx: any) =>
    await runProjectInit({ files, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("project-init")
    .process("sequential")
    .withAgent(scanner)
    .build(),
);
