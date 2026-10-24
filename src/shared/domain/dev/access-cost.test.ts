// Unit tests for the interim access-cost section. Run:
//   node --test src/shared/domain/dev/access-cost.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { COST_NOT_COMPUTED, costSection } from "./access-cost.ts";

describe("costSection", () => {
  it("says the cost is not computed, with the reason", () => {
    strictEqual(COST_NOT_COMPUTED.state, "not-computed");
    strictEqual(
      costSection(COST_NOT_COMPUTED),
      "not computed: Orkeon Code does not measure the access cost yet (it waits for the code graph's statement query); judge the Cost axis from the diff\n",
    );
  });

  it("renders a measured cost: exit, detail, cost line", () => {
    const text = costSection({ state: "measured", exit: 0, flagged: [], costLine: "cost: 3 calls", detail: "a\nb\n" });
    strictEqual(text, "exit: 0\na\nb\ncost: 3 calls\n");
  });

  it("cuts a measured detail at 60 lines", () => {
    const detail = Array.from({ length: 61 }, (_, i) => `line ${i + 1}`).join("\n");
    const lines = costSection({ state: "measured", exit: 2, flagged: ["x"], costLine: "cost: 9", detail }).split("\n");
    strictEqual(lines[0], "exit: 2");
    strictEqual(lines[60], "line 60");
    strictEqual(lines[61], "[cut at 60 lines]");
    strictEqual(lines[62], "cost: 9");
  });

  it("does not add the cut line at exactly 60 lines", () => {
    const detail = Array.from({ length: 60 }, (_, i) => `l${i}`).join("\n");
    const text = costSection({ state: "measured", exit: 0, flagged: [], costLine: "c", detail });
    strictEqual(text.includes("[cut at 60 lines]"), false);
  });
});
