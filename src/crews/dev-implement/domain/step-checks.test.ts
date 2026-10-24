// The checks between two acts. Run:
//   node --test src/crews/dev-implement/domain/step-checks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { changedPaths, greenProblem, readCost, redProblem, statusPaths, under } from "./step-checks.ts";

const red = { ran: true as const, exit: 1, timedOut: false, log: null };
const green = { ran: true as const, exit: 0, timedOut: false, log: null };

describe("statusPaths", () => {
  it("reads both sides of a rename, unquotes, and leaves .orkeon/ out", () => {
    deepStrictEqual(statusPaths(' M src/a.ts\nR  old.ts -> new.ts\n?? "with space.ts"\n?? .orkeon/dev/bin/wait.mjs\n'),
      ["src/a.ts", "old.ts", "new.ts", "with space.ts"]);
  });
});

describe("changedPaths", () => {
  it("names what appeared, vanished, or changed content, and what could not be read", () => {
    const before = new Map([["a", "1"], ["b", "2"], ["c", null]]);
    const after = new Map([["a", "1"], ["b", "3"], ["c", null], ["d", "4"]]);
    deepStrictEqual(changedPaths(before, after), ["b", "c", "d"]);
  });
});

describe("under", () => {
  it("matches a folder and its files only", () => {
    strictEqual(under("tests/a.test.ts", "tests/"), true);
    strictEqual(under("tests2/a.ts", "tests"), false);
  });
});

describe("redProblem", () => {
  it("holds when only tests changed and they fail", () => {
    strictEqual(redProblem(["tests/a.test.ts"], "tests", red), null);
  });
  it("refuses a production path, a green run, a run that did not happen, and no change", () => {
    strictEqual(redProblem(["tests/a.test.ts", "src/a.ts"], "tests", red), "a production path changed before a red test: src/a.ts");
    strictEqual(redProblem(["tests/a.test.ts"], "tests", green), "the new tests pass at once: a test green before its code is never kept");
    strictEqual(redProblem(["tests/a.test.ts"], "tests", { ran: false, reason: "refused" }), "the step's tests did not run: refused");
    strictEqual(redProblem([], "tests", red), "the test author changed no file");
  });
});

describe("greenProblem", () => {
  it("holds when no test changed and the tests pass", () => {
    strictEqual(greenProblem(["src/a.ts"], "tests", green), null);
  });
  it("refuses a test change, a red run and a timeout", () => {
    strictEqual(greenProblem(["src/a.ts", "tests/a.test.ts"], "tests", green), "a test file changed while turning it green: tests/a.test.ts");
    strictEqual(greenProblem(["src/a.ts"], "tests", red), "the step's tests still fail (exit 1)");
    strictEqual(greenProblem(["src/a.ts"], "tests", { ...green, timedOut: true }), "the step's tests timed out");
  });
});

describe("readCost", () => {
  it("reads the line, and refuses none or a loop", () => {
    deepStrictEqual(readCost("done\nCost: 1 reads, 1 writes; none"), { ok: true, line: "Cost: 1 reads, 1 writes; none" });
    strictEqual(readCost("done").ok, false);
    strictEqual(readCost("Cost: 3 reads, 0 writes; a read in a loop over entries").ok, false);
  });
});
