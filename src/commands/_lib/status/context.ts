// /context — the session's context in one row: metadata, buffer size, the tokens used against the
// window, the pressure tier, the compaction boundaries, the prompt-cache tokens, and the tokens by
// kind of entry when the host reports them (Orkeon #226). Lives under commands/_lib/ — the loader's
// SearchPattern is "*.cmd.ts", so this file is never loaded as a command.

import type { SessionMetadata, SessionStats, SessionStore, Telemetry, TokenBudget, TokenKinds } from "../../../shared/application/ports.ts";
import { DEFAULT_CONTEXT_WINDOW, percentLeft, pressureTier } from "../../../shared/domain/compaction-thresholds.ts";
import { countCompactBoundaries } from "../../../shared/domain/compaction.ts";
import { cacheColumns } from "./cache.ts";
import type { CommandView } from "../view.ts";

export interface ContextDeps {
  session: Pick<SessionStore, "readBudget" | "readMessages">;
  telemetry: Pick<Telemetry, "readMetadata" | "readStats">;
}

/** The by-kind columns: one per kind the host reports, none for an older host. */
export function kindColumns(kinds: TokenKinds | undefined): Record<string, number> {
  if (kinds === undefined) return {};
  return {
    systemTokens: kinds.system,
    userTokens: kinds.user,
    assistantTokens: kinds.assistant,
    toolTokens: kinds.tool,
    otherTokens: kinds.other,
  };
}

/** `/context`: the one row, each figure read best effort. */
export async function runContext(deps: ContextDeps): Promise<CommandView> {
  const md = await deps.telemetry.readMetadata().catch((): SessionMetadata => ({}));
  const budget = await deps.session.readBudget().catch((): TokenBudget => ({ used: 0, window: 0 }));
  const stats = await deps.telemetry.readStats().catch((): SessionStats => ({}));
  const boundaries = countCompactBoundaries((await deps.session.readMessages().catch(() => ({ stored: [] }))).stored);
  const { used, window } = budget;
  return {
    table: [{
      title: md.title ?? "(untitled)",
      model: md.model ?? "?",
      messages: md.messageCount ?? 0,
      estTokens: md.estimatedTokens ?? 0,
      usedTokens: used,
      window: window || DEFAULT_CONTEXT_WINDOW,
      remaining: Math.max(0, (window || DEFAULT_CONTEXT_WINDOW) - used),
      pressure: pressureTier(used, window),
      percentLeft: percentLeft(used, window) + "%",
      compactions: boundaries,
      ...kindColumns(budget.byKind),
      ...cacheColumns(stats),
    }],
  };
}
