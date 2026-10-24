// The compaction pipeline, called inline by BOTH the session-compact crew
// (/compact, forced) and the main loop's automatic compaction (above the trigger
// only) — a plain function call, never a crew launch from a crew. In order: the
// durable facts go to typed memory first, so nothing worth keeping is lost; a
// deterministic snip (session_snip) comes next, free of any model call; a summary
// is paid for only when the buffer is still above the trigger, and then the files
// the conversation was working on and the attached skills are read back.
//
// The pipeline runs on the ports of CompactDeps: both entry points wire the Orkeon
// adapters and the running agent's model and log. Memory extraction and the
// restoration of files and skills are in ./extract-memories.ts and
// ./restore-context.ts; the outcome and its line in shared/domain/compact-outcome.ts.

import type { Files, Llm, Logger, MemoryStore, Progress, SessionStore } from "../ports.ts";
import type { CompactOutcome } from "../../domain/compact-outcome.ts";
import type { StateWritten } from "../workflow/workflow-state.ts";
import {
  MIN_COMPACTABLE,
  buildCompactedBuffer,
  buildMemoryRecapMessage,
  buildRestoredStateMessage,
  buildSummaryPrompt,
  buildTranscript,
  extractSummary,
} from "../../domain/compaction.ts";
import { COMPACTION_TRIGGER_CONFIG_KEY, SNIP_RETAIN_COUNT, parseTokenCount, shouldCompact } from "../../domain/compaction-thresholds.ts";
import type { ConfigStore } from "../config-store.ts";
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
  /** Step 0: writes the state file of the dev batch in progress (null: none is). Absent, no step 0. */
  workflow?: (trigger: "manual" | "auto") => Promise<StateWritten | null>;
}

/**
 * Run the compaction pipeline. `force: true` (the /compact crew) skips the
 * threshold check; `force: false` (main-loop auto-compaction) only acts above the
 * trigger. Both stop at `snipped` when the snip alone brought usage back under
 * it. `focus` is what the operator asked the summary to keep above all
 * (`/compact <focus>`). A summary that comes back empty fails the compaction (the
 * breaker counts it) rather than replace the history with nothing.
 */
export async function compactSession(
  opts: { force?: boolean; focus?: string; trigger?: number },
  deps: CompactDeps,
): Promise<CompactOutcome> {
  const { progress, session, files, memory, llm, log } = deps;
  const force = opts.force === true;
  let state: StateWritten | null = null;
  const withState = (o: CompactOutcome): CompactOutcome =>
    state === null ? o : { ...o, state: "path" in state ? { path: state.path } : { skipped: state.skipped } };
  try {
    const raw = await session.readMessages();
    // 0. The state of the dev batch in progress goes to its file first, from files and
    //    git alone. /compact (force) refreshes it whatever the buffer holds.
    if (force) state = await writeState(deps, "manual");
    if (raw.stored.length <= MIN_COMPACTABLE)
      return withState({ status: "skipped", reason: "buffer too small" });

    const { used, window } = await session.readBudget();
    if (!force && !shouldCompact(used, window, opts.trigger))
      return { status: "skipped", reason: "below trigger", usedTokens: used };
    if (!force) state = await writeState(deps, "auto");

    // Progress: reported only past the threshold checks (a skipped compaction must
    // not flash a bar), released on EVERY exit below — snip-only included.
    try {
      // 1. Memory extraction BEFORE any loss — best-effort (extract throws on
      //    non-JSON replies; compaction must never fail because of it).
      await progress.report(compactPhase(1, "extracting memories"));
      const transcript = buildTranscript(raw.messages);
      const memories = await extractMemories(llm, memory, transcript);

      // 2. Deterministic micro-compaction first: strip tool I/O bulk via
      //    session_snip, then re-check. The FORCE path (/compact) also takes this
      //    shortcut — when the snip alone brings usage back under the trigger, no
      //    model call is paid.
      await progress.report(compactPhase(2, "micro-compacting (snip)"));
      await session.snip(SNIP_RETAIN_COUNT);
      const after = await session.readBudget();
      if (!shouldCompact(after.used, after.window, opts.trigger)) {
        note(log, "compaction path: snip-only sufficed (LLM synthesis skipped)");
        return withState({ status: "snipped", before: raw.stored.length, usedTokens: after.used });
      }

      // 3. Full synthesis on the POST-snip buffer.
      note(log, "compaction path: full synthesis");
      await progress.report(compactPhase(3, "synthesizing the summary"));
      const remaining = await session.readMessages();
      if (remaining.stored.length === 0)
        return withState({ status: "snipped", before: raw.stored.length, after: 0 });
      const prompt = buildSummaryPrompt(buildTranscript(remaining.messages), opts.focus);
      const reply = await llm.complete(prompt.user, { system: prompt.system });
      const summary = extractSummary(String(reply ?? ""));
      if (summary.length === 0) return withState({ status: "failed", reason: "the summary came back empty" });
      const buffer = buildCompactedBuffer(remaining.stored[0], summary);
      if (memories.length > 0) buffer.push(buildMemoryRecapMessage(memories));
      // 4. Re-inject the recently-touched files so the agent keeps its working
      //    context (paths harvested from the PRE-compaction buffer).
      await progress.report(compactPhase(4, "restoring recent files"));
      const restored = await restoreRecentFiles(files, raw.messages);
      if (restored.length > 0) {
        buffer.push(...restored);
        note(log, `post-compaction restore: ${restored.length} file(s) re-injected`);
      }
      // 5. Re-inject the ATTACHED SKILLS under their own budget. Files came
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
      // 6. The pointer to the state file written at step 0, last: what to read first.
      if (state !== null && "path" in state) buffer.push(buildRestoredStateMessage(`/workspace/${state.path}`, state.firstOpen));
      await session.writeMessages(buffer);

      return withState({ status: "compacted", before: raw.stored.length, after: buffer.length, usedTokens: used });
    } finally {
      await progress.done(COMPACT_PROGRESS_LABEL);
    }
  } catch (e: any) {
    return withState({ status: "failed", reason: String(e?.message ?? e) });
  }
}

/** Step 0, best-effort: a state that cannot be written is logged, and the compaction goes on. */
async function writeState(deps: CompactDeps, trigger: "manual" | "auto"): Promise<StateWritten | null> {
  if (deps.workflow === undefined) return null;
  try {
    const state = await deps.workflow(trigger);
    if (state !== null) {
      note(deps.log, "path" in state ? `state of the batch in progress written to ${state.path}` : `no state file written: ${state.skipped}`);
    }
    return state;
  } catch (e: any) {
    const reason = String(e?.message ?? e).split("\n")[0];
    try { deps.log.warn(`the state of the batch in progress could not be written: ${reason}`); } catch { /* best-effort */ }
    return { skipped: `it could not be written (${reason})` };
  }
}

/** `/compact --snip [N]`: the head and the last N exchanges kept, nothing summarised. */
export async function snipBuffer(retain: number, deps: { session: Pick<SessionStore, "snip"> }): Promise<string> {
  const { removed, retained } = await deps.session.snip(retain);
  return `snipped: ${removed} removed, ${retained} kept.`;
}

/** The `compaction.trigger` setting as a token count; undefined when unset, invalid
 *  or unreadable (the computed trigger then applies). */
export async function readCompactionTrigger(config: Pick<ConfigStore, "readValue">): Promise<number | undefined> {
  try {
    return parseTokenCount((await config.readValue(COMPACTION_TRIGGER_CONFIG_KEY)).value);
  } catch {
    return undefined;
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
