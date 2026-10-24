// The concurrency of /dev-batches: 1 by default, a whole number from 1 to 4; above 1 only in a mode that never
// asks before a shell command, and the line refusing a worktree git does not work in. Run:
//   node --test src/shared/domain/dev/batches-concurrency.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { MAX_CONCURRENCY, checkConcurrency, concurrencyGitRefusal, concurrencyModeRefusal } from "./batches-concurrency.ts";

describe("checkConcurrency", () => {
  it("is 1 when absent, and accepts 1 to 4 as a number or a string", () => {
    for (const raw of [undefined, null, 1, "1", " 1 "]) deepStrictEqual(checkConcurrency(raw), { ok: true, value: 1 });
    for (const n of [2, 3, 4]) {
      deepStrictEqual(checkConcurrency(n), { ok: true, value: n });
      deepStrictEqual(checkConcurrency(String(n)), { ok: true, value: n });
    }
    strictEqual(MAX_CONCURRENCY, 4);
  });

  it("refuses above 4 in one line", () => {
    for (const raw of [5, "8"]) {
      const c = checkConcurrency(raw);
      ok(!c.ok && c.line === `concurrency ${raw} refused: at most 4 batches at once`, JSON.stringify(c));
    }
  });

  it("refuses what is not a whole number from 1", () => {
    for (const raw of [0, -1, 1.5, "two", "", "1e1", true, {}, Number.NaN]) {
      const c = checkConcurrency(raw);
      ok(!c.ok && c.line.startsWith("concurrency must be a whole number from 1"), String(raw));
    }
  });
});

describe("concurrencyModeRefusal", () => {
  it("refuses above 1 in a mode that asks before shell commands", () => {
    for (const mode of ["default", "acceptEdits", "plan", "dontAsk", ""]) {
      strictEqual(concurrencyModeRefusal(2, mode),
        `concurrency 2 refused: the session mode ${mode || "default"} asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1`);
    }
  });

  it("lets bypassPermissions through, and 1 in any mode", () => {
    strictEqual(concurrencyModeRefusal(2, "bypassPermissions"), null);
    strictEqual(concurrencyModeRefusal(4, " bypassPermissions "), null);
    strictEqual(concurrencyModeRefusal(1, "default"), null);
  });
});

describe("concurrencyGitRefusal", () => {
  it("names the confinement setting and the runtime issue", () => {
    const line = concurrencyGitRefusal(2);
    ok(line.startsWith("concurrency 2 refused: git does not work inside a worktree under this shell confinement (Tools:Shell:Confinement:Mode); run with --concurrency 1"));
    ok(line.includes("Orkeon/orkeon#188"));
  });
});
