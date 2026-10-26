// The charter, the check and the call runSubAgent is tested with.
import type { SubAgentCall } from "../../../../src/shared/application/agents/run-sub-agent.ts";
import type { Charter, Checked } from "../../../../src/shared/domain/agents/charter.ts";

export const CHARTER: Charter = {
  name: "code-reader", role: "Reader", goal: "Read", mode: "plan",
  tools: ["file_read"], disallowed: [], maxIterations: 12,
};

/** Accepts an answer whose count is a number. */
export const hasCount = (value: unknown): Checked<number> => {
  const count = (value as { count?: unknown } | null)?.count;
  return typeof count === "number" ? { ok: true, value: count } : { ok: false, problems: ["count must be a number"] };
};

/** A call of CHARTER with a system, a brief and the count check; `over` replacing some fields. */
export const call = (over: Partial<SubAgentCall<number>> = {}): SubAgentCall<number> => ({
  charter: CHARTER,
  system: "SYSTEM TEXT",
  brief: "BRIEF TEXT",
  schema: { type: "object" },
  answerPrompt: (reply, problems) => `answer from: ${reply}${problems.length ? ` | fix: ${problems.join("; ")}` : ""}`,
  check: hasCount,
  ...over,
});

export interface ErrorCase {
  name: string;
  error: Error;
  reason: string;
}

/** Act failures read as cancelled: the host's cancellation, or a child /tasks stop stopped. */
export const CANCELLED_ACTS: readonly ErrorCase[] = [
  {
    name: "the host's cancellation",
    error: Object.assign(new Error("The operation was canceled."), { name: "OperationCanceledException" }),
    reason: "cancelled",
  },
  { name: "a child /tasks stop stopped", error: new Error("dev-auditor ab12 stopped: stopped by /tasks stop"), reason: "cancelled" },
];

/** Extraction failures reported as they are, without a re-ask. */
export const FINAL_EXTRACTION_FAILURES: readonly ErrorCase[] = [
  { name: "a budget spent", error: new Error("token budget exhausted: 700000 tokens"), reason: "model-failed" },
  { name: "a cancel", error: new Error("The operation was cancelled."), reason: "cancelled" },
];
