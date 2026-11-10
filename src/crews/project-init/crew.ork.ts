// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// ProjectInit crew (/init) — exp 07 SPEC §4.1. Composition root of application/run-project-init.
// Scans the workspace, detects build/test/lint conventions, writes AGENTS.md.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/project-init/crew.ork.ts

import { CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonAgent, orkeonCodeIndex, orkeonFiles } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runProjectInit } from "./application/run-project-init.ts";
import { SCANNER_GOAL, SCANNER_ROLE } from "./application/prompts.ts";

const files = orkeonFiles();
// Read only: /init starts no indexing, it uses the package map of an index already built.
const index = orkeonCodeIndex();

const scanner = orkeonAgent()
  .name("project-initialiser")
  .role(SCANNER_ROLE)
  .goal(SCANNER_GOAL)
  // No tools: the body calls extract and complete, which take none; the reads go
  // through the Files and CodeIndex adapters, not the agent catalogue.
  .tools([])
  .body(async (_input: any, ctx: any) =>
    await runProjectInit({ files, index, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("project-init")
    .process("sequential")
    .withAgent(scanner)
    .build(),
);
