// The guards, facts and cases the turn chains are tested on.
import type { Guard, GuardVerdict, StopFacts, TurnStartFacts } from "./turn-chains.ts";

/** A guard that answers `verdict` and records its id into `seen` when it runs. */
export const guard = (id: string, verdict: GuardVerdict, seen: string[]): Guard<string> => ({
  id, check: () => { seen.push(id); return verdict; },
});

/** A guard whose check throws "boom". */
export const FAILING_GUARD: Guard<string> = { id: "broken", check: () => { throw new Error("boom"); } };

export const START_WITHOUT_SCRIPT: TurnStartFacts = { request: "hi", sessionStart: null };

export const START_WITH_SCRIPT: TurnStartFacts = { request: "hi", sessionStart: { script: "/tmp/s.sh", lines: ["a", "b"] } };

export const START_SCRIPT_CONTEXT: readonly string[] = ["the session's start script (/tmp/s.sh) printed:", "  a", "  b"];

/** A blank answer to a request that asks for no closing line. */
export const BLANK_ANSWER_FACTS: StopFacts = { request: "r", answer: " \n ", closingLine: null };

/** An answer without the closing line its request asks for. */
export const MISSING_CLOSING_LINE_FACTS: StopFacts = { ...BLANK_ANSWER_FACTS, answer: "ok", closingLine: "DONE" };

export interface StopCase {
  name: string;
  facts: StopFacts;
  refusedBy: string | undefined;
}

export const STOP_CASES: readonly StopCase[] = [
  { name: "sends back a blank answer", facts: BLANK_ANSWER_FACTS, refusedBy: "empty-answer" },
  { name: "lets an answer through when no closing line is asked", facts: { ...BLANK_ANSWER_FACTS, answer: "ok" }, refusedBy: undefined },
  { name: "sends back an answer without the closing line", facts: MISSING_CLOSING_LINE_FACTS, refusedBy: "closing-line" },
  {
    name: "lets an answer through with an indented closing line",
    facts: { ...BLANK_ANSWER_FACTS, answer: "ok\n  DONE here", closingLine: "DONE" },
    refusedBy: undefined,
  },
];

/** Values that are no closing line: none, not a string, blank, or more than one line. */
export const NO_CLOSING_LINE_VALUES: readonly unknown[] = [undefined, 3, "", "  ", "a\nb"];
