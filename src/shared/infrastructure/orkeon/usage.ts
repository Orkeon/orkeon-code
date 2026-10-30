// UsageReader adapter over the command context's `usage` service (Orkeon #226): the session's LLM
// usage, in total and by model and by command, as the host's cost manager accounts it. Reached
// through the service locator each command receives, like the approvals; a host that keeps no
// account registers no service and the reader answers nothing. Jint keeps the CLR member names on a
// host object, so both casings are read, and every count is made a number here. A cache or reasoning count no
// call reported is null or absent (Orkeon #254): it stays null, never read as 0.

import type { CommandUsage, ModelUsage, UsageReader, UsageReport, UsageSpent } from "../../application/ports.ts";
import type { SessionUsage, ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { asArray, pick } from "./tool-results.ts";

/** The service name; orkeon-repl registers it while it keeps a cost manager or command instances. */
const USAGE = "usage";

const field = (r: unknown, name: string): unknown => pick(r, name, name[0].toUpperCase() + name.slice(1));

/** A reported count, as a number; absent reads as 0. */
const count = (r: unknown, name: string): number => Number(field(r, name) ?? 0) || 0;

/** A count the host may leave unmeasured: null and absent read as null, a measured 0 as 0. */
function measured(r: unknown, name: string): number | null {
  const v = field(r, name);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A reported cost; null, absent and a non-number all read as unpriced. */
function costOf(r: unknown): number | null {
  const v = pick(r, "cost", "Cost");
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function spentOf(r: unknown): UsageSpent {
  return {
    promptTokens: count(r, "promptTokens"),
    completionTokens: count(r, "completionTokens"),
    cacheHitTokens: measured(r, "cacheHitTokens"),
    cacheWriteTokens: measured(r, "cacheWriteTokens"),
    reasoningTokens: measured(r, "reasoningTokens"),
    calls: count(r, "calls"),
    unpricedCalls: count(r, "unpricedCalls"),
    cost: costOf(r),
  };
}

const text = (r: unknown, name: string): string => String(field(r, name) ?? "");

function modelOf(r: unknown): ModelUsage {
  return { ...spentOf(r), model: text(r, "model") };
}

function commandOf(r: unknown): CommandUsage {
  return { ...spentOf(r), ticket: text(r, "ticket"), name: text(r, "name"), state: text(r, "state") };
}

export function createUsageReader(services: Pick<ServiceLocator, "get" | "has">): UsageReader {
  return {
    report(): UsageReport | undefined {
      try {
        if (!services.has(USAGE)) return undefined;
        const r = services.get<SessionUsage>(USAGE).report();
        return {
          ...spentOf(r),
          totalTokens: count(r, "totalTokens"),
          byModel: asArray(pick(r, "byModel", "ByModel")).map(modelOf),
          byCommand: asArray(pick(r, "byCommand", "ByCommand")).map(commandOf),
        };
      } catch {
        return undefined;
      }
    },
  };
}
