// /cost — the session's cumulative cost and tokens: the host's account when it keeps one (Orkeon
// #226: its cost is null while no call was priced, and a lower bound while some were not), else the
// telemetry's figures. Lives under commands/_lib/ — the loader's SearchPattern is "*.cmd.ts", so this
// file is never loaded as a command.

import type { Telemetry, UsageReader } from "../../../shared/application/ports.ts";
import { unpricedNote } from "./usage.ts";
import type { CommandView } from "../view.ts";

export interface CostDeps {
  telemetry: Pick<Telemetry, "readCost">;
  /** The host's account; absent, or answering nothing: the telemetry's figures stand. */
  usage?: UsageReader;
}

/** `/cost`: the one row, and the lower-bound note when some calls were priced by nobody. */
export async function runCost(deps: CostDeps): Promise<CommandView> {
  const report = deps.usage?.report();
  if (report !== undefined) {
    const note = unpricedNote(report.unpricedCalls);
    return {
      table: [{ costUsd: report.cost ?? "(unpriced)", tokens: report.totalTokens, calls: report.calls, unpricedCalls: report.unpricedCalls }],
      ...(note === null ? {} : { text: note }),
    };
  }
  const c = await deps.telemetry.readCost();
  return { table: [{ costUsd: c.costUsd ?? 0, tokens: c.totalTokens ?? 0, calls: c.totalCalls ?? 0 }] };
}
