// The pruning of stale tool results inside an act's tool loop (ADR 0027, ADR 0034). The runtime does the judging
// (`ctx.llm.act({ prune })`, Orkeon #461): past a share of the call's usable window, the host's decision model says,
// for each older result of a read tool, whether it is still needed and whether it is needed whole, and the runtime
// keeps, cuts or drops it. What stays here is this project's own: the session setting that turns it on, and the
// reading of the tally the act hands back. Pure.

/** The setting that turns the pruning on: `on`, anything else is off. */
export const PRUNE_CONFIG_KEY = "compaction.prune";

/** What an act's pruning did over its loop, for the line the log shows: the runtime's `ActResult.pruned`. */
export interface PruneTally {
  judged: number;
  dropped: number;
  cut: number;
  freedTokens: number;
}

/** Whether the setting's value turns the pruning on. */
export function pruneOn(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "on";
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/** The tally an act's result carries (`result.pruned`); null when it carries none, or not one of counts. */
export function pruneTallyOf(pruned: unknown): PruneTally | null {
  if (typeof pruned !== "object" || pruned === null) return null;
  const raw = pruned as Record<string, unknown>;
  const judged = count(raw.judged);
  const dropped = count(raw.dropped);
  const cut = count(raw.cut);
  const freedTokens = count(raw.freedTokens);
  if (judged === null || dropped === null || cut === null || freedTokens === null) return null;
  return { judged, dropped, cut, freedTokens };
}
