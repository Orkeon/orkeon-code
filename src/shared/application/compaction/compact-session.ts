// The compaction pipeline, called inline by BOTH the session-compact crew
// (/compact, forced) and the main loop's automatic compaction (above the trigger
// only) — a plain function call, never a crew launch from a crew. In order: the
// durable facts go to typed memory first, so nothing worth keeping is lost; the
// summary is written from the whole buffer as it stands (clipped head and tail by
// the prompt), then the files the conversation was working on and the attached
// skills are read back. A request still waiting for its answer (the compaction at the head of a turn) stays last,
// after all of them, so the answer that follows has its request before it. The deterministic snip (session_snip) is the fallback of a
// summary that fails, and `/compact --snip`: either leaves a notice in the buffer
// saying the earlier turns were removed without a summary.
//
// The pipeline runs on the ports of CompactDeps: both entry points wire the Orkeon
// adapters and the running agent's model, log and clock. Memory extraction and the
// restoration of files and skills are in ./extract-memories.ts and
// ./restore-context.ts; the outcome and its line in shared/domain/compact-outcome.ts.

import type { Clock, Files, Llm, Logger, MemoryStore, Progress, SessionStore } from "../ports.ts";
import type { CompactOutcome } from "../../domain/compact-outcome.ts";
import type { StateWritten } from "../workflow/workflow-state.ts";
import {
  MIN_COMPACTABLE,
  buildCompactedBuffer,
  buildMemoryRecapMessage,
  buildRestoredStateMessage,
  buildSnipNoticeMessage,
  buildSummaryPrompt,
  buildTranscript,
  extractSummary,
} from "../../domain/compaction.ts";
import { COMPACTION_TRIGGER_CONFIG_KEY, SNIP_RETAIN_COUNT, parseTokenCount, shouldCompact } from "../../domain/compaction-thresholds.ts";
import type { ConfigStore } from "../config-store.ts";
import { extractMemories } from "./extract-memories.ts";
import { restoreAttachedSkills, restoreRecentFiles } from "./restore-context.ts";
import { WORKSPACE } from "../../domain/vfs.ts";
import { isoDay } from "../../domain/iso-day.ts";
import { pendingRequestLength } from "../../domain/marked-message.ts";

/** The ports the pipeline runs on. */
export interface CompactDeps {
  progress: Progress;
  session: SessionStore;
  files: Files;
  memory: MemoryStore;
  llm: Llm;
  log: Logger;
  /** Today's date for the memory extraction, so a relative date is saved as an absolute one: the UTC day, as the
   *  Environment line of the turn gives it. */
  clock: Clock;
  /** Step 0: writes the state file of the dev batch in progress (null: none is). Absent, no step 0. */
  workflow?: (trigger: "manual" | "auto") => Promise<StateWritten | null>;
}

/**
 * Run the compaction pipeline. `force: true` (the /compact crew) skips the
 * threshold check; `force: false` (main-loop auto-compaction) only acts above the
 * trigger. Past it, every run pays one summary call over the whole buffer.
 * `focus` is what the operator asked the summary to keep above all
 * (`/compact <focus>`). A summary that comes back empty, or a model that fails,
 * fails the compaction (the breaker counts it) rather than replace the history
 * with nothing: the buffer is snipped instead, with a notice, and the outcome says
 * so (`fallback: "snip"`).
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
    // The budget first: under the trigger the automatic run reads no message, so a turn does not pay a read of
    // the whole buffer at its head and its tail.
    const gated = force ? null : await session.readBudget();
    if (gated !== null && !shouldCompact(gated.used, gated.window, opts.trigger))
      return { status: "skipped", reason: "below trigger", usedTokens: gated.used };
    const raw = await session.readMessages();
    // 0. The state of the dev batch in progress goes to its file first, from files and
    //    git alone. /compact (force) refreshes it whatever the buffer holds.
    if (force) state = await writeState(deps, "manual");
    if (raw.stored.length <= MIN_COMPACTABLE)
      return withState({ status: "skipped", reason: "buffer too small" });
    const { used } = gated ?? await session.readBudget();
    if (!force) state = await writeState(deps, "auto");

    // Progress: reported only past the threshold checks (a skipped compaction must
    // not flash a bar), released on EVERY exit below — the fallback included.
    try {
      // 1. Memory extraction BEFORE any loss — best-effort (extract throws on
      //    non-JSON replies; compaction must never fail because of it).
      await progress.report(compactPhase(1, "extracting memories"));
      const transcript = buildTranscript(raw.messages);
      const memories = await extractMemories(llm, memory, transcript, isoDay(deps.clock()));

      // 2. The summary, from the buffer as it stands: the prompt clips the transcript head and tail.
      await progress.report(compactPhase(2, "synthesizing the summary"));
      const summary = await summarise(llm, transcript, opts.focus);
      if ("failure" in summary) return withState(await snipFallback(deps, summary.failure));
      const buffer = buildCompactedBuffer(raw.stored[0], summary.text);
      if (memories.length > 0) buffer.push(buildMemoryRecapMessage(memories));
      // 3. Re-inject the recently-touched files so the agent keeps its working
      //    context (paths harvested from the buffer before the compaction).
      await progress.report(compactPhase(3, "restoring recent files"));
      const restored = await restoreRecentFiles(files, raw.messages);
      if (restored.length > 0) {
        buffer.push(...restored);
        note(log, `post-compaction restore: ${restored.length} file(s) re-injected`);
      }
      // 4. Re-inject the ATTACHED SKILLS under their own budget. Files came
      //    back because the agent was touching them; skills come back because the
      //    operator attached them and expects them to outlive every compaction —
      //    which is exactly what "the agent forgot the rules" looks like when they
      //    do not.
      await progress.report(compactPhase(4, "restoring attached skills"));
      const skills = await restoreAttachedSkills(session, files);
      if (skills.length > 0) {
        buffer.push(...skills);
        note(log, `post-compaction restore: ${skills.length} skill(s) re-injected`);
      }
      // 5. The pointer to the state file written at step 0, last: what to read first.
      if (state !== null && "path" in state) buffer.push(buildRestoredStateMessage(`${WORKSPACE}/${state.path}`, state.firstOpen));
      // 6. The request still waiting for its answer, with its [turn-context], stays last: the summary records it, and
      //    the answer appended next must follow it.
      const pending = pendingRequestLength(raw.messages);
      if (pending > 0) buffer.push(...raw.stored.slice(raw.stored.length - pending));
      await session.writeMessages(buffer);

      return withState({ status: "compacted", before: raw.stored.length, after: buffer.length, usedTokens: used });
    } finally {
      await progress.done(COMPACT_PROGRESS_LABEL);
    }
  } catch (e: any) {
    return withState({ status: "failed", reason: String(e?.message ?? e) });
  }
}

/** The summary of `transcript`, or why there is none: an empty reply or a model that failed. */
async function summarise(llm: Llm, transcript: string, focus: string | undefined): Promise<{ text: string } | { failure: string }> {
  try {
    const prompt = buildSummaryPrompt(transcript, focus);
    const reply = await llm.complete(prompt.user, { system: prompt.system });
    const text = extractSummary(String(reply ?? ""));
    return text.length === 0 ? { failure: "the summary came back empty" } : { text };
  } catch (e: any) {
    return { failure: String(e?.message ?? e) };
  }
}

/** No summary: the buffer is snipped with a notice, and the compaction still fails (the breaker counts it). A snip
 *  that fails too, or removes nothing, leaves the failure of the summary as the reason and no fallback; a notice that
 *  cannot be written is logged, the fallback kept (the buffer was cut). */
async function snipFallback(deps: CompactDeps, reason: string): Promise<CompactOutcome> {
  let removed: number;
  try {
    ({ removed } = await deps.session.snip(SNIP_RETAIN_COUNT));
  } catch {
    return { status: "failed", reason };
  }
  if (removed === 0) return { status: "failed", reason };
  try {
    await leaveSnipNotice(deps.session);
  } catch (e: any) {
    note(deps.log, `the notice of the snip could not be written: ${String(e?.message ?? e).split("\n")[0]}`);
  }
  note(deps.log, `compaction path: no summary (${reason}), the buffer was snipped`);
  return { status: "failed", reason, fallback: "snip" };
}

/** The notice that the turns a snip removed were not summarised, right after the head so that the current request
 *  stays last; none added when one already sits there (a second snip). */
async function leaveSnipNotice(session: Pick<SessionStore, "readMessages" | "writeMessages">): Promise<void> {
  const { stored } = await session.readMessages();
  const notice = buildSnipNoticeMessage();
  if (stored.length > 1 && String((stored[1] as { content?: unknown })?.content ?? "") === notice.content) return;
  await session.writeMessages(stored.length === 0 ? [notice] : [stored[0], notice, ...stored.slice(1)]);
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

/** `/compact --snip [N]`: the head and the last N messages kept, nothing summarised, a notice saying so. */
export async function snipBuffer(
  retain: number,
  deps: { session: Pick<SessionStore, "snip" | "readMessages" | "writeMessages"> },
): Promise<string> {
  const { removed, retained } = await deps.session.snip(retain);
  if (removed > 0) await leaveSnipNotice(deps.session);
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

/** Total phases of the full pipeline (extract, synthesis, files, skills). */
const COMPACT_PROGRESS_TOTAL = 4;

function compactPhase(step: number, message: string) {
  return { label: COMPACT_PROGRESS_LABEL, step, total: COMPACT_PROGRESS_TOTAL, message };
}

/** Logging is best-effort: a log that fails never fails the compaction. */
function note(log: Logger, message: string): void {
  try { log.info(message); } catch { /* logging is best-effort */ }
}
