// The chain-depth refusal of runCrewAsync from a completed (V-A5). Run:
//   node --test src/shared/domain/agents/chain.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { MAX_CHAIN_DEPTH, chainDepthLine, chainDepthRefusal } from "./chain.ts";

describe("chainDepthRefusal", () => {
  it("reads the depth and the limit from the runtime's message, as an error or a string", () => {
    deepStrictEqual(chainDepthRefusal(new Error("Async command chain refused at depth 9, limit 8.")), { depth: 9, limit: 8 });
    deepStrictEqual(chainDepthRefusal("Async command chain refused at depth 3, limit 2."), { depth: 3, limit: 2 });
  });

  it("is null for any other failure", () => {
    strictEqual(chainDepthRefusal(new Error("crew not found")), null);
    strictEqual(chainDepthRefusal(undefined), null);
  });

  it("names the default limit, and the line says what to do", () => {
    strictEqual(MAX_CHAIN_DEPTH, 8);
    const line = chainDepthLine("dev-verify", { depth: 9, limit: 8 });
    ok(line.startsWith("dev-verify not launched"));
    ok(line.includes("depth 9, limit 8") && line.includes("MaxChainDepth"));
  });
});
