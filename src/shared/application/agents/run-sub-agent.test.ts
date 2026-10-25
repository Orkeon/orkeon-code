// runSubAgent over FakeLlm: act in the charter's mode, extract, check, one re-ask. Run:
//   node --test src/shared/application/agents/run-sub-agent.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { runSubAgent } from "./run-sub-agent.ts";
import type { SubAgentCall } from "./run-sub-agent.ts";
import type { Charter, Checked } from "../../domain/agents/charter.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";

const CHARTER: Charter = {
  name: "code-reader", role: "Reader", goal: "Read", mode: "plan",
  tools: ["file_read"], disallowed: [], maxIterations: 12,
};

const hasCount = (value: unknown): Checked<number> => {
  const count = (value as { count?: unknown } | null)?.count;
  return typeof count === "number" ? { ok: true, value: count } : { ok: false, problems: ["count must be a number"] };
};

const call = (over: Partial<SubAgentCall<number>> = {}): SubAgentCall<number> => ({
  charter: CHARTER,
  system: "SYSTEM TEXT",
  brief: "BRIEF TEXT",
  schema: { type: "object" },
  answerPrompt: (reply, problems) => `answer from: ${reply}${problems.length ? ` | fix: ${problems.join("; ")}` : ""}`,
  check: hasCount,
  ...over,
});

describe("runSubAgent", () => {
  it("acts with the system, the charter's mode and iterations, then extracts", async () => {
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [{ count: 3 }];
    const outcome = await runSubAgent(llm, call());
    deepStrictEqual(outcome, { ok: true, value: 3, reply: "the reply", tries: 1 });
    deepStrictEqual(llm.acts, [{ prompt: "BRIEF TEXT", request: { system: "SYSTEM TEXT", permissionMode: "plan", maxIterations: 12 } }]);
    ok(!("model" in llm.acts[0].request));
    deepStrictEqual(llm.extracts, [{ prompt: "answer from: the reply", schema: { type: "object" } }]);
  });

  it("offers the call's tools when it names them, the agent's whole catalogue otherwise", async () => {
    const llm = new FakeLlm();
    llm.extractions = [{ count: 1 }];
    await runSubAgent(llm, call({ tools: ["file_read", "node_read"] }));
    deepStrictEqual(llm.acts[0].request.tools, ["file_read", "node_read"]);
    await runSubAgent(llm, call());
    ok(!("tools" in llm.acts[1].request));
  });

  it("passes the charter's model only when it has one", async () => {
    const llm = new FakeLlm();
    llm.extractions = [{ count: 1 }];
    await runSubAgent(llm, call({ charter: { ...CHARTER, model: "small-model" } }));
    strictEqual(llm.acts[0].request.model, "small-model");
  });

  it("makes no call for an invalid charter", async () => {
    const llm = new FakeLlm();
    const outcome = await runSubAgent(llm, call({ charter: { ...CHARTER, mode: "default" } }));
    deepStrictEqual(outcome, {
      ok: false, reason: "invalid-charter", reply: "",
      problems: ["charter code-reader: mode default can write; a sub-agent runs read-only (plan or dontAsk) for now"],
    });
    strictEqual(llm.acts.length + llm.extracts.length, 0);
  });

  it("makes no call for a brief over 24 000 characters", async () => {
    const llm = new FakeLlm();
    const outcome = await runSubAgent(llm, call({ brief: "x".repeat(24_001) }));
    deepStrictEqual(outcome, {
      ok: false, reason: "brief-too-long", reply: "", problems: ["the brief is 24001 characters, over 24000"],
    });
    strictEqual(llm.acts.length + llm.extracts.length, 0);
  });

  it("reports a failing act as model-failed, with the first line of its message", async () => {
    const llm = new FakeLlm();
    llm.answers = [new Error("provider down\nstack detail")];
    const outcome = await runSubAgent(llm, call());
    deepStrictEqual(outcome, { ok: false, reason: "model-failed", reply: "", problems: ["provider down"] });
    strictEqual(llm.extracts.length, 0);
  });

  it("reports a cancelled act as cancelled: the host's cancellation, or a child /tasks stop stopped", async () => {
    const canceled = Object.assign(new Error("The operation was canceled."), { name: "OperationCanceledException" });
    for (const error of [canceled, new Error("dev-auditor ab12 stopped: stopped by /tasks stop")]) {
      const llm = new FakeLlm();
      llm.answers = [error];
      const outcome = await runSubAgent(llm, call());
      deepStrictEqual(outcome, { ok: false, reason: "cancelled", reply: "", problems: [error.message] });
    }
  });

  it("reports a budget spent or a cancel during the extraction as such, without a re-ask", async () => {
    const cases: Array<[Error, string]> = [
      [new Error("token budget exhausted: 700000 tokens"), "model-failed"],
      [new Error("The operation was cancelled."), "cancelled"],
    ];
    for (const [error, reason] of cases) {
      const llm = new FakeLlm();
      llm.answers = ["the reply"];
      llm.extractions = [error, { count: 7 }];
      const outcome = await runSubAgent(llm, call());
      deepStrictEqual(outcome, { ok: false, reason, reply: "the reply", problems: [error.message] });
      strictEqual(llm.extracts.length, 1);
    }
  });

  it("re-asks once without a new act when the first extraction throws", async () => {
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [new Error("Unexpected token\nat 3"), { count: 7 }];
    const outcome = await runSubAgent(llm, call());
    deepStrictEqual(outcome, { ok: true, value: 7, reply: "the reply", tries: 2 });
    strictEqual(llm.acts.length, 1);
    strictEqual(llm.extracts[1].prompt, "answer from: the reply | fix: the answer did not parse: Unexpected token");
  });

  it("gives unparsable with the problems of the second try when the check fails twice", async () => {
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [{ count: "three" }, { nothing: true }];
    const outcome = await runSubAgent(llm, call());
    deepStrictEqual(outcome, { ok: false, reason: "unparsable", reply: "the reply", problems: ["count must be a number"] });
    strictEqual(llm.acts.length, 1);
    strictEqual(llm.extracts.length, 2);
    ok(llm.extracts[1].prompt.includes("count must be a number"));
    ok(!llm.extracts[0].prompt.includes("fix:"));
  });
});
