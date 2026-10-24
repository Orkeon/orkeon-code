// The concurrency of /dev-batches: 1 by default, a whole number from 1, above 1 refused in one line naming
// the follow-up issue. Run:
//   node --test src/shared/domain/dev/batches-concurrency.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { PARALLEL_FOLLOW_UP, checkConcurrency } from "./batches-concurrency.ts";

describe("checkConcurrency", () => {
  it("is 1 when absent, and accepts 1 as a number or a string", () => {
    for (const raw of [undefined, null, 1, "1", " 1 "]) deepStrictEqual(checkConcurrency(raw), { ok: true, value: 1 });
  });

  it("refuses above 1 in one line naming the follow-up issue", () => {
    for (const raw of [2, "8"]) {
      const c = checkConcurrency(raw);
      strictEqual(c.ok, false);
      ok(!c.ok && !c.line.includes("\n"));
      ok(!c.ok && c.line.includes(`"${PARALLEL_FOLLOW_UP}"`) && c.line.startsWith(`concurrency ${raw} refused: parallel runs wait`));
    }
  });

  it("refuses what is not a whole number from 1", () => {
    for (const raw of [0, -1, 1.5, "two", "", "1e1", true, {}, Number.NaN]) {
      const c = checkConcurrency(raw);
      ok(!c.ok && c.line.startsWith("concurrency must be a whole number from 1"), String(raw));
    }
  });
});
