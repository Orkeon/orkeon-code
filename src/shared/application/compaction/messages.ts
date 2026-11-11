// The text the compaction reports: its progress phases, its log lines and the outcome of a snip.

export const PHASE_SUMMARY = "synthesizing the summary";
export const PHASE_RECENT_FILES = "restoring recent files";
export const PHASE_ATTACHED_SKILLS = "restoring attached skills";
export const filesReinjected = (count: number): string => `post-compaction restore: ${count} file(s) re-injected`;
export const skillsReinjected = (count: number): string => `post-compaction restore: ${count} skill(s) re-injected`;
export const SUMMARY_CAME_BACK_EMPTY = "the summary came back empty";
export const snipNoticeNotWritten = (reason: string): string => `the notice of the snip could not be written: ${reason}`;
export const bufferWasSnipped = (reason: string): string => `compaction path: no summary (${reason}), the buffer was snipped`;
export const stateWrittenTo = (path: string): string => `state of the batch in progress written to ${path}`;
export const noStateFileWritten = (skipped: string): string => `no state file written: ${skipped}`;
export const stateNotWritten = (reason: string): string => `the state of the batch in progress could not be written: ${reason}`;
export const couldNotBeWritten = (reason: string): string => `it could not be written (${reason})`;
export const snippedLine = (removed: number, kept: number): string => `snipped: ${removed} removed, ${kept} kept.`;
export const PRUNE_WITHOUT_DECISION_MODEL =
  "compaction.prune is on and the host has no decision model: nothing is pruned (set Orkeon:Decision:Provider, or Orkeon:TypeSafe)";
export const PRUNE_DECISION_FAILED = "context pruning: the decision model did not answer, nothing more is pruned in this act";
export const prunedLine = (judged: number, dropped: number, cut: number, freedTokens: number): string =>
  `context pruning: ${judged} tool result(s) judged, ${dropped} removed, ${cut} cut, about ${freedTokens} tokens freed`;
