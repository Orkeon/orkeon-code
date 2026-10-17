// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// SessionCompact crew (/compact) — exp 07 SPEC §4.2. Composition root.
// Thin wrapper over the shared compaction pipeline (shared/application/
// compaction/, F3): memory extraction → session_snip micro-compaction →
// LLM synthesis → buffer rewrite. `/compact` forces the full pipeline; the
// main-loop reuses the same function threshold-gated (auto-compaction).
//
// Run standalone:  bash scripts/run-crew.sh src/crews/session-compact/crew.ork.ts

import { AgentBuilder, CrewBuilder, publishCrew } from "../../shared/infrastructure/globals.ts";
import {
  orkeonFiles, orkeonMemoryStore, orkeonProgress, orkeonSessionIo,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { compactSession } from "../../shared/application/compaction/compact-session.ts";
import { formatOutcome } from "../../shared/domain/compact-outcome.ts";

const compactor = AgentBuilder()
  .name("session-compactor")
  .role("Context Window Manager")
  .goal("Summarise the conversation buffer into a compact form that preserves decisions, code, and open tasks.")
  // file_read: post-compaction file restoration (E-4) re-reads recent files.
  .tools(["session_store", "session_snip", "token_budget", "memory_store", "file_read"])
  .body(async (_input: any, ctx: any) => {
    const deps = {
      progress: orkeonProgress(), session: orkeonSessionIo(), files: orkeonFiles(), memory: orkeonMemoryStore(),
      llm: createLlm(ctx.llm), log: ctx.log,
    };
    return formatOutcome(await compactSession({ force: true }, deps));
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("session-compact")
    .process("sequential")
    .withAgent(compactor)
    .build(),
);
