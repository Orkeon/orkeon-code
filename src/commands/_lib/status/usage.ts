// /usage — the token usage against the context window (pressure tier, compaction trigger) and the conversation's
// estimated tokens, then the session's calls, the tokens sent and received as the providers counted them, their total,
// the cost, the cache tokens and the cache ratio, in one row; then a legend and the usage by model and by command the
// host accounts (Orkeon #226). runUsage reads the rows over the ports. Lives under
// commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type {
  CommandUsage, ModelUsage, SessionCost, SessionStats, SessionStore, Telemetry, UsageReader, UsageReport, UsageSpent,
} from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { readCompactionTrigger } from "../../../shared/application/compaction/compact-session.ts";
import {
  DEFAULT_CONTEXT_WINDOW, computeTrigger, percentLeft, pressureTier,
} from "../../../shared/domain/compaction-thresholds.ts";
import { UNREPORTED, type Unreported, cacheColumns, shown } from "./cache.ts";
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
  // A cache read no call reported is left out; one measured, 0 included, is named.
  const cached = s.cacheHitTokens === null ? "" : ` (${s.cacheHitTokens} from the cache)`;
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

/** What the row's columns count, and which are estimates: the closing text opens with it. */
export const USAGE_LEGEND = [
  "usedTokens, estTokens: the conversation's size in the context window, estimated by the host.",
  "llm*: counted by the providers over every call: llmInTokens sent, llmOutTokens received (llmReasoningTokens a part of",
  "them), llmTokens = in + out. cacheRead and cacheWrite are parts of llmInTokens; cacheRatio = cacheRead / llmInTokens.",
  "n/a: not reported, never a measured 0.",
].join("\n");

/** The share of the prompt tokens read from the cache, to two decimals; `n/a` when no call reported a cache read, or
 *  no prompt token is counted: an unmeasured cache never reads as a ratio of 0. */
export function cacheRatio(cacheRead: number | Unreported, promptTokens: number | Unreported): string {
  return cacheRead !== UNREPORTED && promptTokens !== UNREPORTED && promptTokens > 0
    ? (cacheRead / promptTokens).toFixed(2)
    : UNREPORTED;
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
  const promptTokens = shown(report?.promptTokens ?? s.promptTokens);
  return {
    table: [{
      usedTokens: used,
      contextWindow: window || `(default ${DEFAULT_CONTEXT_WINDOW})`,
      percentLeft: percentLeft(used, window) + "%",
      pressure: pressureTier(used, window),
      autocompactAt: computeTrigger(window, trigger) + (trigger ? " (compaction.trigger)" : ""),
      messages: s.messageCount ?? 0,
      estTokens: s.estimatedTokens ?? 0,
      llmCalls: report?.calls ?? s.totalCalls ?? 0,
      llmInTokens: promptTokens,
      llmOutTokens: shown(report?.completionTokens ?? s.completionTokens),
      llmReasoningTokens: shown(report?.reasoningTokens ?? s.reasoningTokens),
      llmTokens: report?.totalTokens ?? s.totalTokens ?? 0,
      costUsd: report ? (report.cost ?? "(unpriced)") : (c.costUsd ?? 0),
      ...(report ? { unpricedCalls: report.unpricedCalls } : {}),
      ...cache,
      cacheRatio: cacheRatio(cache.cacheRead, promptTokens),
    }],
    text: `${USAGE_LEGEND}\n${usageBreakdown(report)}`,
  };
}
