// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// SessionCompact crew (/compact) — composition root.
// Thin wrapper over the shared compaction pipeline (shared/application/
// compaction/): memory extraction → LLM synthesis over the whole buffer →
// buffer rewrite (a failed summary falls back to the snip, with a notice). `/compact` forces the full pipeline; the
// main-loop reuses the same function threshold-gated (auto-compaction). Step 0
// writes the state file of the dev batch in progress (.orkeon/dev/<code>/
// state-F<n>.md) when a step command named one (session state workflow_active).
//
// Run standalone:  bash scripts/run-crew.sh src/crews/session-compact/crew.ork.ts

import { CrewBuilder, inputs, publishCrew } from "../../shared/infrastructure/globals.ts";
import {
  orkeonAgent,
  orkeonClock,
  orkeonCompactionDeps,
  orkeonConfigStore,
  orkeonFiles,
  orkeonMemoryStore,
  orkeonProgress,
  orkeonSessionIo,
  orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { compactSession, snipBuffer } from "../../shared/application/compaction/compact-session.ts";
import { formatOutcome } from "../../shared/domain/compact-outcome.ts";
import { COMPACTOR_GOAL, COMPACTOR_ROLE } from "./application/prompts.ts";

const compactor = orkeonAgent()
  .name("session-compactor")
  .role(COMPACTOR_ROLE)
  .goal(COMPACTOR_GOAL)
  // file_read: after a compaction, the files the conversation was working on are read back.
  .tools(["session_store", "session_snip", "token_budget", "memory_store", "file_read"])
  .body(async (_input: any, ctx: any) => {
    const deps = orkeonCompactionDeps({ llm: createLlm(ctx.llm), log: ctx.log }, {
      progress: orkeonProgress(), session: orkeonSessionIo(), files: orkeonFiles(), memory: orkeonMemoryStore(),
      shell: orkeonShell(), config: orkeonConfigStore(),
    }, orkeonClock());
    // /compact --snip [N]: truncate only, nothing summarised.
    const snip = Number(inputs()?.snip ?? 0);
    if (snip > 0) return await snipBuffer(snip, deps);
    const focus = String(inputs()?.focus ?? "").trim();
    return formatOutcome(await compactSession({ force: true, focus }, deps));
  })
  .build();

publishCrew(
  CrewBuilder()
    .name("session-compact")
    .process("sequential")
    .withAgent(compactor)
    .build(),
);
