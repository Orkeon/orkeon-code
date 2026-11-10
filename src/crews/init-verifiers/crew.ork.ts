// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// InitVerifiers crew (/init-verifiers) — exp 07 SPEC §4.5. Composition root of
// application/run-init-verifiers: detects app type + test tooling, then authors
// one verification skill per zone that lacks a verifier, under /output/verifiers/.
// No tools: the body reads through the Files port and calls extract and complete,
// which take none.
//
// Run standalone:  bash scripts/run-crew.sh src/crews/init-verifiers/crew.ork.ts

import { CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonAgent, orkeonFiles } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runInitVerifiers } from "./application/run-init-verifiers.ts";
import { AUTHOR_GOAL, AUTHOR_ROLE } from "./application/prompts.ts";

const files = orkeonFiles();

const author = orkeonAgent()
  .name("verifier-author")
  .role(AUTHOR_ROLE)
  .goal(AUTHOR_GOAL)
  .tools([])
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
