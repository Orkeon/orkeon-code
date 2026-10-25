// The change briefs checkChangeAnswer and pinOnlyKnown are tested on.
import type { ChangeAnswer } from "./change-answer.ts";

/** A well-formed brief of any kind, `over` replacing some fields. */
export const good = (over: Partial<ChangeAnswer> = {}): ChangeAnswer => ({
  route: "change", name: "The map is read on every call", summary: "A second request reads the file again.",
  evidence: [], suspected: "", criteria: [{ name: "Read once", statement: "a second request reads no file within 5 ms", proof: "the reproduction turns green", severity: "blocking" }],
  mustNotChange: [{ behaviour: "an absent map gives an empty map", pinnedBy: "loads an absent map" }],
  scope: [], constraints: [], assumptions: [], questions: [], ...over,
});

export const KINDS = ["bug", "refactor", "perf"] as const;

/** A brief whose one criterion holds no number. */
export const NO_NUMBER = good({ criteria: [{ name: "Faster", statement: "a second request is faster", proof: "the timing", severity: "blocking" }] });

export interface RefusedAnswerCase {
  name: string;
  answer: ChangeAnswer;
  problem: RegExp;
}

/** Bug briefs refused, and the problem each is refused for. */
export const REFUSED_BUG_ANSWERS: readonly RefusedAnswerCase[] = [
  { name: "design words", answer: good({ summary: "Add a new class MapCache." }), problem: /^no design/ },
  { name: "a TBD without a question", answer: good({ summary: "The limit is TBD." }), problem: /TBD/ },
  { name: "a broken cell", answer: good({ mustNotChange: [{ behaviour: "a | b", pinnedBy: "" }] }), problem: /'\|'/ },
  { name: "no criterion", answer: good({ criteria: [] }), problem: /at least one/ },
];

/** A brief whose protected rows name a known test, an unknown one and none. */
export const THREE_PINS = good({
  mustNotChange: [{ behaviour: "x", pinnedBy: "`known test`" }, { behaviour: "y", pinnedBy: "ghost" }, { behaviour: "z", pinnedBy: "" }],
});
