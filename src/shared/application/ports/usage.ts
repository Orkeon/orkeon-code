// The usage port: the session's LLM usage by category, as the host accounts it (Orkeon #226).
// Types only, re-exported by ../ports.ts.

/** The tokens of a set of calls: the cache counts are a part of the prompt, the reasoning a part of the completion.
 *  A cache or reasoning count is null when no call of the set reported it (Orkeon #254): not measured, never 0. */
export interface UsageTokens {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
}

/** What a set of calls spent: `cost` is null when no call of the set was priced; `unpricedCalls` counts the calls
 *  nobody priced, which `cost` counts as 0 (while it is not 0, the cost is a lower bound). */
export interface UsageSpent extends UsageTokens {
  calls: number;
  unpricedCalls: number;
  cost: number | null;
}

/** One model the provider named in its answers. */
export interface ModelUsage extends UsageSpent {
  model: string;
}

/** One command instance the session keeps, the newest first. */
export interface CommandUsage extends UsageSpent {
  ticket: string;
  name: string;
  state: string;
}

/** The session's usage of the moment: the totals over every recorded call (a call whose provider named no model is
 *  in the totals and in no model row), then by model and by command. */
export interface UsageReport extends UsageSpent {
  totalTokens: number;
  byModel: ModelUsage[];
  byCommand: CommandUsage[];
}

/** The reader of the session's usage; undefined when the host keeps no account, or the read fails. */
export interface UsageReader {
  report(): UsageReport | undefined;
}
