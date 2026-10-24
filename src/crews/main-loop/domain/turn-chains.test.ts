// The two chains of checks around a main-loop turn, and their built-in guards. Run:
//   node --test src/crews/main-loop/domain/turn-chains.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  STOP_GUARDS, TURN_CONTEXT_MARKER, TURN_START_GUARDS, buildStopRetryPrompt, buildTurnContextMessage,
  readClosingLine, refusedTurnText, runChain,
} from "./turn-chains.ts";
import type { Guard, GuardVerdict } from "./turn-chains.ts";

const guard = (id: string, verdict: GuardVerdict, seen: string[]): Guard<string> => ({
  id, check: () => { seen.push(id); return verdict; },
});

describe("runChain", () => {
  it("runs every guard in order and gathers their context lines when none refuses", () => {
    const seen: string[] = [];
    const out = runChain("turn-start", [
      guard("a", { decision: "allow", context: ["one", " "] }, seen),
      guard("b", { decision: "block", context: ["two"] }, seen),
    ], "facts");
    deepStrictEqual(seen, ["a", "b"]);
    deepStrictEqual(out, { context: ["one", "two"] });
  });

  it("stops at the first deny of turn-start, with the context gathered so far", () => {
    const seen: string[] = [];
    const out = runChain("turn-start", [
      guard("a", { decision: "allow", context: ["one"] }, seen),
      guard("b", { decision: "deny", reason: "no", context: ["two"] }, seen),
      guard("c", { decision: "deny" }, seen),
    ], "facts");
    deepStrictEqual(seen, ["a", "b"]);
    deepStrictEqual(out, { refusedBy: "b", reason: "no", context: ["one", "two"] });
  });

  it("stops at the first block of stop, and names the guard when it gave no reason", () => {
    const seen: string[] = [];
    const out = runChain("stop", [guard("x", { decision: "block" }, seen), guard("y", { decision: "block" }, seen)], "f");
    deepStrictEqual(out, { refusedBy: "x", reason: "refused by x", context: [] });
    deepStrictEqual(seen, ["x"]);
  });

  it("counts a guard that throws as a refusal naming it", () => {
    const failing: Guard<string> = { id: "broken", check: () => { throw new Error("boom"); } };
    deepStrictEqual(runChain("stop", [failing], "f"), { refusedBy: "broken", reason: "the check failed: boom", context: [] });
    strictEqual(runChain("turn-start", [failing], "f").refusedBy, "broken");
  });
});

describe("the built-in guards", () => {
  it("turn-start adds the start script's lines, and nothing without them", () => {
    deepStrictEqual(runChain("turn-start", TURN_START_GUARDS, { request: "hi", sessionStart: null }), { context: [] });
    deepStrictEqual(
      runChain("turn-start", TURN_START_GUARDS, { request: "hi", sessionStart: { script: "/tmp/s.sh", lines: ["a", "b"] } }),
      { context: ["the session's start script (/tmp/s.sh) printed:", "  a", "  b"] },
    );
  });

  it("stop sends back a blank answer, then one without the closing line", () => {
    const facts = { request: "r", answer: " \n ", closingLine: null };
    strictEqual(runChain("stop", STOP_GUARDS, facts).refusedBy, "empty-answer");
    strictEqual(runChain("stop", STOP_GUARDS, { ...facts, answer: "ok" }).refusedBy, undefined);
    const closing = runChain("stop", STOP_GUARDS, { ...facts, answer: "ok", closingLine: "DONE" });
    strictEqual(closing.refusedBy, "closing-line");
    strictEqual(closing.reason, "the answer has no line starting with 'DONE': end it with that line");
    strictEqual(runChain("stop", STOP_GUARDS, { ...facts, answer: "ok\n  DONE here", closingLine: "DONE" }).refusedBy, undefined);
  });
});

describe("the texts of the chains", () => {
  it("marks the context message, and builds the retry prompt and the refusal line", () => {
    const msg = buildTurnContextMessage(["a", "b"]);
    ok(msg.startsWith(`${TURN_CONTEXT_MARKER} `));
    ok(msg.endsWith("\na\nb"));
    const retry = buildStopRetryPrompt("P", "", "why");
    ok(retry.startsWith("P\n\n[stop-check] Your previous answer to this request was sent back: why.\n"));
    ok(retry.includes("Previous answer:\n(empty)\n[/stop-check]"));
    strictEqual(refusedTurnText({ refusedBy: "g", reason: "r", context: [] }), "turn refused (g): r");
  });

  it("reads closingLine as one non-blank line, else none", () => {
    strictEqual(readClosingLine(" DONE "), "DONE");
    for (const v of [undefined, 3, "", "  ", "a\nb"]) strictEqual(readClosingLine(v), null);
  });
});
