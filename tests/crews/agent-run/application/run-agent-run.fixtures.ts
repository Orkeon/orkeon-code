// The charter and the recording model runAgentRun is tested over.
import type { Charter } from "../../../../src/shared/domain/agents/charter.ts";
import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";

export const CHARTER: Charter = {
  name: "dev-reviewer", role: "r", goal: "g", mode: "plan", tools: ["file_read"], disallowed: [], maxIterations: 12,
};

/** A model that records each act (prompt, request) and answers `reply`, and the deps runAgentRun takes. */
export function agentRunSetup(reply = "the answer") {
  const asked: Array<[string, unknown]> = [];
  const llm = { act: async (p: string, r: unknown) => { asked.push([p, r]); return reply; } };
  return { asked, deps: { llm, log: new FakeLogger(), charters: { "dev-reviewer": CHARTER } as Record<string, Charter> } };
}

export interface RefusedRunCase {
  name: string;
  input: { charter: string; brief: string };
  error: RegExp;
}

/** Inputs runAgentRun refuses. */
export const REFUSED_RUNS: readonly RefusedRunCase[] = [
  {
    name: "an unknown charter",
    input: { charter: "tester", brief: "b" },
    error: /unknown charter 'tester' \(known: dev-reviewer\)/,
  },
  { name: "an empty brief", input: { charter: "dev-reviewer", brief: "  " }, error: /the brief is empty/ },
  {
    name: "a brief over MAX_BRIEF_CHARS",
    input: { charter: "dev-reviewer", brief: "x".repeat(MAX_BRIEF_CHARS + 1) },
    error: /over 24000/,
  },
];
