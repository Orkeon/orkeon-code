// The /dev-learn state: Orkeon Code's own file and the harness's, read only. Run:
//   node --test src/shared/domain/dev/learn-state.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import {
  HARNESS_LEARN_STATE_FILE, LEARN_STATE_FILE, decisionOf, emptyLearnState, parseHarnessLearnState, parseLearnState,
  serializeLearnState, withDecision,
} from "./learn-state.ts";
import type { DecisionRecord, LearnState } from "./learn-state.ts";

const ACCEPT: DecisionRecord = { motif: "3f2a9c1e", decision: "accepted", date: "2026-10-22", axis: "Test", title: "Refusal paths go untested" };
const REFUSE: DecisionRecord = { motif: "77b0d2aa", decision: "refused", date: "2026-10-23", axis: "Plan", title: "Batches too wide" };

describe("learn state files", () => {
  it("names the two state files relative to /workspace", () => {
    strictEqual(LEARN_STATE_FILE, ".orkeon/dev-learn-state.json");
    strictEqual(HARNESS_LEARN_STATE_FILE, ".claude/local/dev-learn-state.json");
  });
});

describe("parseLearnState", () => {
  it("an absent file reads as the empty state", () => {
    deepStrictEqual(parseLearnState(null), { ok: true, state: { version: 1, treated: [], decisions: [] } });
    deepStrictEqual(emptyLearnState(), { version: 1, treated: [], decisions: [] });
  });

  it("invalid JSON is a problem naming the file and the parser's first line, never an empty state", () => {
    const r = parseLearnState("{ not json");
    strictEqual(r.ok, false);
    if (!r.ok) {
      strictEqual(r.problem.startsWith(".orkeon/dev-learn-state.json is not JSON ("), true);
      strictEqual(r.problem.endsWith(")"), true);
      strictEqual(r.problem.includes("\n"), false);
    }
  });

  it("each wrong shape names its field", () => {
    const cases: [string, string][] = [
      ["[]", "the top level"],
      ["null", "the top level"],
      [`{"version":2,"treated":[],"decisions":[]}`, "version"],
      [`{"treated":[],"decisions":[]}`, "version"],
      [`{"version":1,"treated":3,"decisions":[]}`, "treated"],
      [`{"version":1,"treated":["a",1],"decisions":[]}`, "treated"],
      [`{"version":1,"treated":[]}`, "decisions"],
      [`{"version":1,"treated":[],"decisions":[{"motif":"a"}]}`, "decisions[0]"],
      [`{"version":1,"treated":[],"decisions":[${JSON.stringify(ACCEPT)},${JSON.stringify({ ...REFUSE, decision: "maybe" })}]}`, "decisions[1]"],
    ];
    for (const [text, field] of cases) {
      deepStrictEqual(parseLearnState(text), { ok: false, problem: `.orkeon/dev-learn-state.json: ${field} has the wrong shape` }, text);
    }
  });

  it("round trips through serializeLearnState, one-space indented with a final line break", () => {
    const state: LearnState = { version: 1, treated: ["0b1c2d3e4f", "68abc1ec48"], decisions: [ACCEPT, REFUSE] };
    const text = serializeLearnState(state);
    strictEqual(text, JSON.stringify(state, null, 1) + "\n");
    deepStrictEqual(parseLearnState(text), { ok: true, state });
  });
});

describe("withDecision and decisionOf", () => {
  it("adds the rows to treated, sorted and unique, and records the decision", () => {
    const start: LearnState = { version: 1, treated: ["9a8b7c6d5e", "0b1c2d3e4f"], decisions: [] };
    const next = withDecision(start, ACCEPT, ["68abc1ec48", "0b1c2d3e4f", "68abc1ec48"]);
    deepStrictEqual(next.treated, ["0b1c2d3e4f", "68abc1ec48", "9a8b7c6d5e"]);
    deepStrictEqual(next.decisions, [ACCEPT]);
    deepStrictEqual(start.treated, ["9a8b7c6d5e", "0b1c2d3e4f"], "the input state is not changed");
    deepStrictEqual(decisionOf(next, "3f2a9c1e"), ACCEPT);
    strictEqual(decisionOf(next, "77b0d2aa"), undefined);
  });

  it("a second decision on the same motif replaces the first", () => {
    const once = withDecision(withDecision(emptyLearnState(), ACCEPT, []), REFUSE, []);
    const twice = withDecision(once, { ...ACCEPT, decision: "refused" }, []);
    deepStrictEqual(twice.decisions, [REFUSE, { ...ACCEPT, decision: "refused" }]);
  });
});

describe("parseHarnessLearnState", () => {
  it("reads both lists and drops non-string items", () => {
    deepStrictEqual(parseHarnessLearnState(`{"treated":["68abc1ec48",4,null],"refused":["Batches too wide"],"x":1}`),
      { treated: ["68abc1ec48"], refused: ["Batches too wide"] });
  });

  it("anything unreadable or of the wrong shape counts as empty lists", () => {
    const empty = { treated: [], refused: [] };
    for (const text of [null, "", "{ nope", "[1,2]", "\"text\"", "null", `{"treated":3}`, `{"treated":{"a":1},"refused":"x"}`]) {
      deepStrictEqual(parseHarnessLearnState(text), empty, String(text));
    }
    deepStrictEqual(parseHarnessLearnState(`{"treated":3,"refused":["a"]}`), { treated: [], refused: ["a"] });
  });
});
