// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// Advisor crew (/advisor review) — B-12. Composition root of application/run-advisor.
// A one-shot second opinion on the session's last exchange, from a DIFFERENT model.
//
// Input (globalThis.inputs): {} — the subject is the session buffer.
// Run standalone:  bash scripts/run-crew.sh src/crews/advisor/crew.ork.ts
//
// No tools: an advisor reads the exchange and judges it. Handing it file or shell
// access would let it go re-verify the work, which is a different (and much more
// expensive) job than the one the baseline describes — and it would make the crew's
// cost unbounded for what is meant to be a single call.
//
// The model override is what makes this worth running: `advisor.model` is applied
// per call via `{ llm: { model } }`, so the reviewer is not the author. That path
// only became usable once the scripting facade stopped replacing the provider's
// config wholesale (it used to drop the API key) — see the framework fix of
// 2026-08-05.

import { AgentBuilder, CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import { orkeonConfigStore, orkeonSessionIo } from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { runAdvisor } from "./application/run-advisor.ts";

const ports = { config: orkeonConfigStore(), session: orkeonSessionIo() };

const advisor = AgentBuilder()
  .name("advisor")
  .role("Independent Reviewer")
  .goal("Give a blunt second opinion on the last answer the coding agent produced.")
  .maxIterations(1)
  .body(async (_input: any, ctx: any) =>
    await runAdvisor({ ...ports, llm: createLlm(ctx.llm), log: ctx.log }))
  .build();

publishCrew(
  CrewBuilder()
    .name("advisor")
    .process("sequential")
    .withAgent(advisor)
    .build(),
);
