// Shared compaction pipeline (FINALIZE-PLAN F3) — called inline by BOTH the
// session-compact crew (/compact, force) and the main-loop auto-compaction
// (threshold-gated). NEVER via ctx.crew.run / ctx.delegate (Jint constraints):
// plain function call. Pipeline mirrors the Claude Code two-phase design:
// memory extraction first (nothing durable is
// lost), deterministic micro-compaction (session_snip) before any LLM summary,
// full synthesis only when still above the trigger.
//
// The pipeline runs on the ports of CompactDeps: both entry points wire the Orkeon
// adapters and the running agent's model and log. Memory extraction and the
// restoration of files and skills are in ./extract-memories.ts and
// ./restore-context.ts; the outcome and its line in shared/domain/compact-outcome.ts.

import type { Files, Llm, Logger, MemoryStore, Progress, SessionStore } from "../ports.ts";
import type { CompactOutcome } from "../../domain/compact-outcome.ts";
import {
  MIN_COMPACTABLE,
  buildCompactedBuffer,
  buildMemoryRecapMessage,
  buildSummaryPrompt,
  buildTranscript,
} from "../../domain/compaction.ts";
import { SNIP_RETAIN_COUNT, shouldCompact } from "../../domain/compaction-thresholds.ts";
import { extractMemories } from "./extract-memories.ts";
import { restoreAttachedSkills, restoreRecentFiles } from "./restore-context.ts";

/** The ports the pipeline runs on. */
export interface CompactDeps {
  progress: Progress;
  session: SessionStore;
  files: Files;
  memory: MemoryStore;
  llm: Llm;
  log: Logger;
}

/**
 * Run the compaction pipeline. `force: true` (the /compact crew) skips the
 * threshold check and always goes to full synthesis; `force: false` (main-loop
 * auto-compaction) only acts above the trigger and stops at `snipped` when the
 * micro-compaction alone brought usage back under it.
 */
export async function compactSession(
  opts: { force?: boolean },
  deps: CompactDeps,
): Promise<CompactOutcome> {
  const { progress, session, files, memory, llm, log } = deps;
  const force = opts.force === true;
  try {
    const raw = await session.readMessages();
    if (raw.stored.length <= MIN_COMPACTABLE)
      return { status: "skipped", reason: "buffer too small" };

    const { used, window } = await session.readBudget();
    if (!force && !shouldCompact(used, window))
      return { status: "skipped", reason: "below trigger", usedTokens: used };

    // Progress: reported only past the threshold checks (a skipped compaction must
    // not flash a bar), released on EVERY exit below — snip-only included.
    try {
      // 1. Memory extraction BEFORE any loss — best-effort (extract throws on
      //    non-JSON replies; compaction must never fail because of it).
      await progress.report(compactPhase(1, "extracting memories"));
      const transcript = buildTranscript(raw.messages);
      const memories = await extractMemories(llm, memory, transcript);

      // 2. Deterministic micro-compaction first: strip tool I/O bulk via
      //    session_snip, then re-check. E-6: the FORCE path (/compact) also
      //    takes this session-memory shortcut — when the snip alone brings
      //    usage back under the trigger, no LLM synthesis is paid.
      await progress.report(compactPhase(2, "micro-compacting (snip)"));
      await session.snip(SNIP_RETAIN_COUNT);
      const after = await session.readBudget();
      if (!shouldCompact(after.used, after.window)) {
        note(log, "compaction path: snip-only sufficed (LLM synthesis skipped)");
        return { status: "snipped", before: raw.stored.length, usedTokens: after.used };
      }

      // 3. Full synthesis on the POST-snip buffer.
      note(log, "compaction path: full synthesis");
      await progress.report(compactPhase(3, "synthesizing the summary"));
      const remaining = await session.readMessages();
      if (remaining.stored.length === 0)
        return { status: "snipped", before: raw.stored.length, after: 0 };
      const summary = await llm.complete(buildSummaryPrompt(buildTranscript(remaining.messages)));
      const buffer = buildCompactedBuffer(remaining.stored[0], String(summary ?? ""));
      if (memories.length > 0) buffer.push(buildMemoryRecapMessage(memories));
      // 4. E-4: re-inject the recently-touched files so the agent keeps its
      //    working context (paths harvested from the PRE-compaction buffer).
      await progress.report(compactPhase(4, "restoring recent files"));
      const restored = await restoreRecentFiles(files, raw.messages);
      if (restored.length > 0) {
        buffer.push(...restored);
        note(log, `post-compaction restore: ${restored.length} file(s) re-injected`);
      }
      // 5. B-13: re-inject the ATTACHED SKILLS under their own budget. Files came
      //    back because the agent was touching them; skills come back because the
      //    operator attached them and expects them to outlive every compaction —
      //    which is exactly what "the agent forgot the rules" looks like when they
      //    do not.
      await progress.report(compactPhase(5, "restoring attached skills"));
      const skills = await restoreAttachedSkills(session, files);
      if (skills.length > 0) {
        buffer.push(...skills);
        note(log, `post-compaction restore: ${skills.length} skill(s) re-injected`);
      }
      await session.writeMessages(buffer);

      return { status: "compacted", before: raw.stored.length, after: buffer.length, usedTokens: used };
    } finally {
      await progress.done(COMPACT_PROGRESS_LABEL);
    }
  } catch (e: any) {
    return { status: "failed", reason: String(e?.message ?? e) };
  }
}

/** Status-line headline of the compaction progress. */
export const COMPACT_PROGRESS_LABEL = "Compacting conversation";

/** Total phases of the full pipeline (extract, snip, synthesis, files, skills). */
const COMPACT_PROGRESS_TOTAL = 5;

function compactPhase(step: number, message: string) {
  return { label: COMPACT_PROGRESS_LABEL, step, total: COMPACT_PROGRESS_TOTAL, message };
}

/** Logging is best-effort: a log that fails never fails the compaction. */
function note(log: Logger, message: string): void {
  try { log.info(message); } catch { /* logging is best-effort */ }
}
