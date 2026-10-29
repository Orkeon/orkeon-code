// /usage — the token usage against the context window (pressure tier, compaction trigger), the
// session's calls, tokens, cost, estimated tokens, cache tokens and cache ratio in one row, then the usage by model and by
// command the host accounts (Orkeon #226). runUsage reads the rows over the ports. Lives under
// commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type {
  CommandUsage, ModelUsage, SessionCost, SessionStats, SessionStore, Telemetry, UsageReader, UsageReport, UsageSpent,
} from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readCompactionTrigger } from "../../../shared/application/compaction/compact-session.ts";
import {
  DEFAULT_CONTEXT_WINDOW, computeTrigger, percentLeft, pressureTier,
} from "../../../shared/domain/compaction-thresholds.ts";
import { cacheColumns } from "./cache.ts";
import type { CommandView } from "../view.ts";

export interface UsageDeps {
  session: Pick<SessionStore, "readBudget">;
  telemetry: Pick<Telemetry, "readStats" | "readCost">;
  config: Pick<ConfigStore, "readValue">;
  /** The host's account by model and by command; absent, or answering nothing: the breakdown says so. */
  usage?: UsageReader;
}

/** What a host without the usage service leaves the breakdown with. */
export const NO_USAGE_SERVICE = "usage by model and command: not reported by this host (no usage service)";

/** A cost as the breakdown shows it: unpriced when the host priced no call of the set. */
export function costText(cost: number | null): string {
  return cost === null ? "cost unpriced" : `$${cost.toFixed(4)}`;
}

/** The lower-bound note, when some calls were priced by nobody. */
export function unpricedNote(unpricedCalls: number): string | null {
  return unpricedCalls > 0 ? `${unpricedCalls} call(s) unpriced: the cost is a lower bound` : null;
}

function spentText(s: UsageSpent): string {
  const cached = s.cacheHitTokens > 0 ? ` (${s.cacheHitTokens} from the cache)` : "";
  return `${s.calls} call(s), ${s.promptTokens} prompt${cached}, ${s.completionTokens} completion, ${costText(s.cost)}`;
}

function modelLine(m: ModelUsage): string {
  return `  ${m.model || "(unnamed model)"}: ${spentText(m)}`;
}

function commandLine(c: CommandUsage): string {
  return `  [${c.ticket}] ${c.name} (${c.state}): ${spentText(c)}`;
}

/** The breakdown of a report, as the closing text: by model, by command, the lower-bound note; undefined when the
 *  host keeps no account. */
export function usageBreakdown(report: UsageReport | undefined): string {
  if (report === undefined) return NO_USAGE_SERVICE;
  const lines = [
    report.byModel.length > 0 ? "by model:" : "by model: none named by the provider yet",
    ...report.byModel.map(modelLine),
    report.byCommand.length > 0 ? "by command:" : "by command: no command instance yet",
    ...report.byCommand.map(commandLine),
  ];
  const note = unpricedNote(report.unpricedCalls);
  if (note !== null) lines.push(note);
  return lines.join("\n");
}

/** The share of the session's tokens read from the cache, to two decimals; `-` when the host reports no cache or no
 *  token. */
export function cacheRatio(cacheRead: number | "-", tokens: number): string {
  return cacheRead !== "-" && tokens > 0 ? (cacheRead / tokens).toFixed(2) : "-";
}

/** `/usage`: the one row, each figure read best effort, then the breakdown. */
export async function runUsage(deps: UsageDeps): Promise<CommandView> {
  const [{ used, window }, s, c, trigger] = await Promise.all([
    deps.session.readBudget().catch(() => ({ used: 0, window: 0 })),
    deps.telemetry.readStats().catch((): SessionStats => ({})),
    deps.telemetry.readCost().catch((): SessionCost => ({})),
    readCompactionTrigger(deps.config),
  ]);
  const report = deps.usage?.report();
  const cache = cacheColumns(s);
  return {
    table: [{
      usedTokens: used,
      contextWindow: window || `(default ${DEFAULT_CONTEXT_WINDOW})`,
      percentLeft: percentLeft(used, window) + "%",
      pressure: pressureTier(used, window),
      autocompactAt: computeTrigger(window, trigger) + (trigger ? " (compaction.trigger)" : ""),
      messages: s.messageCount ?? 0,
      llmCalls: report?.calls ?? s.totalCalls ?? 0,
      llmTokens: report?.totalTokens ?? s.totalTokens ?? 0,
      costUsd: report ? (report.cost ?? "(unpriced)") : (c.costUsd ?? 0),
      ...(report ? { unpricedCalls: report.unpricedCalls } : {}),
      ...cache,
      estTokens: s.estimatedTokens ?? 0,
      cacheRatio: cacheRatio(cache.cacheRead, s.totalTokens ?? 0),
    }],
    text: usageBreakdown(report),
  };
}
