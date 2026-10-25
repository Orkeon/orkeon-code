// /status — the session's status in one table: the model, the workspace, the
// context, the cost, the crews, and the version and platform that /version, /env,
// /session and /upgrade (its aliases now) used to show apart. runStatus reads the
// rows over the ports. Lives under commands/_lib/ — the loader's SearchPattern is
// "*.cmd.ts", so this file is never loaded as a command.

import type {
  CrewHost, SessionCost, SessionMetadata, SessionStats, SessionStore, Shell, Telemetry,
} from "../../shared/application/ports.ts";
import { CLI_BUILD, CLI_NAME, CLI_VERSION, ORKEON_RUNTIME_VERSION } from "./meta.ts";
import type { CommandView } from "./view.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

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
  /** OS, architecture and node version, as the shell reports them. */
  platform?: unknown;
  /** The host's LLM provider, as its `llm` service names it. */
  provider?: unknown;
}

/** How Orkeon Code is updated: there is no self-update channel. */
export const UPDATE_NOTE =
  "no self-update: update the orkeon-code checkout (git pull, or a newer release archive) and relaunch; " +
  "the Orkeon runtime it runs on is pinned by its .orkeon-version";

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
    // The host's default provider: a turn on another profile runs on that profile's.
    { field: "provider", value: String(i.provider ?? "").trim() ? `${String(i.provider).trim()} (the host's default)` : "(unreported by the host)" },
    { field: "workspace", value: String(i.workspace ?? WORKSPACE) },
    { field: "session", value: String(i.title ?? "").trim() || "(untitled)" },
    { field: "messages", value: String(Number(i.messages ?? 0) || 0) },
    { field: "context", value: `${used} tokens${pct}` },
    { field: "llm", value: `${Number(i.calls ?? 0) || 0} call(s), ${Number(i.totalTokens ?? 0) || 0} token(s)` },
    { field: "cost", value: `$${cost.toFixed(4)}` },
    {
      field: "crews",
      value: (i.crews?.length ?? 0) > 0 ? [...i.crews!].sort().join(", ") : "(none discovered)",
    },
    { field: "version", value: `${CLI_NAME} ${CLI_VERSION} (${CLI_BUILD})` },
    { field: "runtime", value: `Orkeon ${ORKEON_RUNTIME_VERSION} (pinned by .orkeon-version)` },
    { field: "platform", value: String(i.platform ?? "").trim() || "(unavailable)" },
    { field: "updates", value: UPDATE_NOTE },
  ];
}

export interface StatusDeps {
  session: Pick<SessionStore, "readBudget">;
  telemetry: Telemetry;
  crews: Pick<CrewHost, "listCrews">;
  /** For the platform row; absent: the row says unavailable. */
  shell?: Pick<Shell, "run">;
  /** The provider row's reader; absent, or answering nothing: the row says unreported. */
  provider?: () => string | undefined;
}

/** One allow-listed command (node), no shell operator: the shell tool refuses them. */
export const PLATFORM_COMMAND = "node -p \"[process.platform, process.arch, 'node ' + process.version].join('  ')\"";

/** `/status`: the rows, each read best effort and on its own, so a missing session
 *  store degrades one row, not the whole command. */
export async function runStatus(deps: StatusDeps): Promise<CommandView> {
  const { session, telemetry } = deps;
  const [md, cost, stats, budget, platform] = await Promise.all([
    telemetry.readMetadata().catch((): SessionMetadata => ({})),
    telemetry.readCost().catch((): SessionCost => ({})),
    telemetry.readStats().catch((): SessionStats => ({})),
    session.readBudget().catch(() => ({ used: 0, window: 0 })),
    deps.shell ? deps.shell.run(PLATFORM_COMMAND).then((r) => r.stdout).catch(() => "") : Promise.resolve(""),
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
      workspace: WORKSPACE,
      platform,
      provider: deps.provider?.(),
    }),
  };
}
