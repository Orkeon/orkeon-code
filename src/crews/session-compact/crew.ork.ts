// @orkeon-script 1.0
/// <reference path="../.orkeon/orkeon.d.ts" />
//
// SessionCompact crew (/compact) — composition root.
// Thin wrapper over the shared compaction pipeline (shared/application/
// compaction/): memory extraction → session_snip micro-compaction →
// LLM synthesis → buffer rewrite. `/compact` forces the full pipeline; the
// main-loop reuses the same function threshold-gated (auto-compaction). Step 0
// writes the state file of the dev batch in progress (.orkeon/dev/<code>/
// state-F<n>.md) when a step command named one (session state workflow_active).
//
// Run standalone:  bash scripts/run-crew.sh src/crews/session-compact/crew.ork.ts

import { AgentBuilder, CrewBuilder, inputs, publishCrew } from "../../shared/infrastructure/globals.ts";
import {
  orkeonClock, orkeonCompactionDeps, orkeonConfigStore, orkeonFiles, orkeonMemoryStore, orkeonProgress,
  orkeonSessionIo, orkeonShell,
} from "../../shared/infrastructure/orkeon/wiring.ts";
import { createLlm } from "../../shared/infrastructure/orkeon/llm.ts";
import { compactSession, snipBuffer } from "../../shared/application/compaction/compact-session.ts";
import { formatOutcome } from "../../shared/domain/compact-outcome.ts";

const compactor = AgentBuilder()
  .name("session-compactor")
  .role("Context Window Manager")
  .goal("Summarise the conversation buffer into a compact form that preserves decisions, code, and open tasks.")
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
