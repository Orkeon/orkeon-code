// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// InitVerifiers crew (/init-verifiers) — exp 07 SPEC §4.5. Composition root of
// application/run-init-verifiers: detects app type + test tooling, then authors
// one verification skill per zone that lacks a verifier, under /output/verifiers/.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/init-verifiers/crew.ork.ts

import { AgentBuilder, CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonFiles } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runInitVerifiers } from "./application/run-init-verifiers.ts";

const files = orkeonFiles();

const author = AgentBuilder()
  .name("verifier-author")
  .role("QA Tooling Engineer")
  .goal("Detect how this project is tested and author verification skills for any zone missing one.")
  .tools(["directory_read", "file_read"])
  .body(async (_input: any, ctx: any) =>
    await runInitVerifiers({ files, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("init-verifiers")
    .process("sequential")
    .withAgent(author)
    .build(),
);
