// One act of a built-in charter on a repair brief (A-3), over a FakeLlm. Run:
//   node --test src/crews/agent-run/application/run-agent-run.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { runAgentRun } from "./run-agent-run.ts";
import type { Charter } from "../../../shared/domain/agents/charter.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";

const CHARTER: Charter = {
  name: "dev-reviewer", role: "r", goal: "g", mode: "plan", tools: ["file_read"], disallowed: [], maxIterations: 12,
};

function setup(reply = "the answer") {
  const asked: Array<[string, unknown]> = [];
  const llm = { act: async (p: string, r: unknown) => { asked.push([p, r]); return reply; } };
  return { asked, deps: { llm, log: new FakeLogger(), charters: { "dev-reviewer": CHARTER } } };
}

describe("runAgentRun", () => {
  it("acts once on the brief in the charter's mode, with its system and its cap", async () => {
    const { asked, deps } = setup();
    strictEqual(await runAgentRun({ charter: "dev-reviewer", system: "S", brief: " fix it " }, deps), "the answer");
    deepStrictEqual(asked, [["fix it", { system: "S", permissionMode: "plan", maxIterations: 12 }]]);
  });

  it("passes the charter's model, and no system when there is none", async () => {
    const { asked, deps } = setup();
    deps.charters = { "dev-reviewer": { ...CHARTER, model: "m" } };
    await runAgentRun({ charter: "dev-reviewer", brief: "b" }, deps);
    deepStrictEqual(asked[0][1], { permissionMode: "plan", maxIterations: 12, model: "m" });
  });

  it("refuses an unknown charter, an empty brief and one over MAX_BRIEF_CHARS", async () => {
    const { deps } = setup();
    await rejects(runAgentRun({ charter: "tester", brief: "b" }, deps), /unknown charter 'tester' \(known: dev-reviewer\)/);
    await rejects(runAgentRun({ charter: "dev-reviewer", brief: "  " }, deps), /the brief is empty/);
    await rejects(runAgentRun({ charter: "dev-reviewer", brief: "x".repeat(MAX_BRIEF_CHARS + 1) }, deps), /over 24000/);
  });
});
