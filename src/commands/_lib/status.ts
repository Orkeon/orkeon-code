// /status — the rows of the fields the baseline names (B-11 deepening); runStatus
// reads them over the ports. Lives under commands/_lib/ — the loader's
// SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type {
  CrewHost, SessionCost, SessionMetadata, SessionStats, SessionStore, Telemetry,
} from "../../shared/application/ports.ts";
import type { CommandView } from "./view.ts";

export interface StatusInputs {
  model?: unknown;
  title?: unknown;
  messages?: unknown;
  usedTokens?: unknown;
  windowTokens?: unknown;
  totalTokens?: unknown;
  costUsd?: unknown;
  calls?: unknown;
  crews?: readonly string[];
  workspace?: unknown;
}

/**
 * The `/status` rows.
 *
 * Baseline 04 §/status names four things: model, cost, workspace and crew summary.
 * The pre-B-11 handler showed messages/tokens/cost/calls — so the two the operator
 * most often opens `/status` to check, the model and the workspace, were the two
 * missing. `(unreported)` rather than `?` for the model: it is an absence with a
 * cause (see /model), not an unknown value.
 */
export function buildStatusRows(i: StatusInputs): Array<{ field: string; value: string }> {
  const used = Number(i.usedTokens ?? 0) || 0;
  const window = Number(i.windowTokens ?? 0) || 0;
  const pct = window > 0 ? ` (${Math.round((used / window) * 100)}% of ${window})` : "";
  const cost = Number(i.costUsd ?? 0) || 0;

  return [
    { field: "model", value: String(i.model ?? "").trim() || "(unreported by the host — see /model)" },
    { field: "workspace", value: String(i.workspace ?? "/workspace") },
    { field: "session", value: String(i.title ?? "").trim() || "(untitled)" },
    { field: "messages", value: String(Number(i.messages ?? 0) || 0) },
    { field: "context", value: `${used} tokens${pct}` },
    { field: "llm", value: `${Number(i.calls ?? 0) || 0} call(s), ${Number(i.totalTokens ?? 0) || 0} token(s)` },
    { field: "cost", value: `$${cost.toFixed(4)}` },
    {
      field: "crews",
      value: (i.crews?.length ?? 0) > 0 ? [...i.crews!].sort().join(", ") : "(none discovered)",
    },
  ];
}

export interface StatusDeps {
  session: Pick<SessionStore, "readBudget">;
  telemetry: Telemetry;
  crews: Pick<CrewHost, "listCrews">;
}

/** `/status`: the rows, each read best effort and on its own, so a missing session
 *  store degrades one row, not the whole command. */
export async function runStatus(deps: StatusDeps): Promise<CommandView> {
  const { session, telemetry } = deps;
  const [md, cost, stats, budget] = await Promise.all([
    telemetry.readMetadata().catch((): SessionMetadata => ({})),
    telemetry.readCost().catch((): SessionCost => ({})),
    telemetry.readStats().catch((): SessionStats => ({})),
    session.readBudget().catch(() => ({ used: 0, window: 0 })),
  ]);

  return {
    table: buildStatusRows({
      model: md.model,
      title: md.title,
      messages: md.messageCount ?? stats.messageCount,
      usedTokens: budget.used,
      windowTokens: budget.window,
      totalTokens: cost.totalTokens ?? stats.totalTokens,
      costUsd: cost.costUsd,
      calls: cost.totalCalls ?? stats.totalCalls,
      crews: deps.crews.listCrews(),
      workspace: "/workspace",
    }),
  };
}
