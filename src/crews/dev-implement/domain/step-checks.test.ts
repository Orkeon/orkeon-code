// The checks between two acts. Run:
//   node --test src/crews/dev-implement/domain/step-checks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { changedPaths, greenProblem, readCost, redProblem, statusPaths, under } from "./step-checks.ts";

const red = { ran: true as const, exit: 1, timedOut: false, log: null };
const green = { ran: true as const, exit: 0, timedOut: false, log: null };
const isTest = (p: string): boolean => under(p, "tests") || p.endsWith(".test.ts");

describe("statusPaths", () => {
  it("reads both sides of a rename, unquotes, and leaves .orkeon/ out", () => {
    deepStrictEqual(statusPaths(' M src/a.ts\nR  old.ts -> new.ts\n?? "with space.ts"\n?? .orkeon/dev/bin/wait.mjs\n'),
      ["src/a.ts", "old.ts", "new.ts", "with space.ts"]);
  });
});

describe("changedPaths", () => {
  it("names what appeared, vanished, or changed content; a path unread on both sides is not a change", () => {
    const before = new Map<string, string | null>([["a", "1"], ["b", "2"], ["c", null], ["e", null]]);
    const after = new Map<string, string | null>([["a", "1"], ["b", "3"], ["c", null], ["d", "4"], ["e", "5"]]);
    deepStrictEqual(changedPaths(before, after), ["b", "d", "e"]);
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
    strictEqual(redProblem(["tests/a.test.ts"], isTest, red), null);
  });
  it("refuses a production path, a green run, a run that did not happen, and no change", () => {
    strictEqual(redProblem(["tests/a.test.ts", "src/a.ts"], isTest, red), "a production path changed before a red test: src/a.ts");
    strictEqual(redProblem(["tests/a.test.ts"], isTest, green), "the new tests pass at once: a test green before its code is never kept");
    strictEqual(redProblem(["tests/a.test.ts"], isTest, { ran: false, reason: "refused" }), "the step's tests did not run: refused");
    strictEqual(redProblem([], isTest, red), "the test author changed no file");
  });
  it("lets the step's stubs through with a test, never alone, and no other production file", () => {
    strictEqual(redProblem(["tests/a.test.ts", "src/a.ts"], isTest, red, ["src/a.ts"]), null);
    strictEqual(redProblem(["src/a.ts"], isTest, red, ["src/a.ts"]), "the test author changed no test file, only stubs: src/a.ts");
    strictEqual(redProblem(["tests/a.test.ts", "src/b.ts"], isTest, red, ["src/a.ts"]), "a production path changed before a red test: src/b.ts");
  });
  it("counts a test file beside the code as a test", () => {
    strictEqual(redProblem(["src/a.test.ts"], isTest, red), null);
  });
});

describe("greenProblem", () => {
  it("holds when no test changed and the tests pass", () => {
    strictEqual(greenProblem(["src/a.ts"], isTest, green), null);
  });
  it("refuses a test change, a red run and a timeout", () => {
    strictEqual(greenProblem(["src/a.ts", "tests/a.test.ts"], isTest, green), "a test file changed while turning it green: tests/a.test.ts");
    strictEqual(greenProblem(["src/a.ts"], isTest, red), "the step's tests still fail (exit 1)");
    strictEqual(greenProblem(["src/a.ts"], isTest, { ...green, timedOut: true }), "the step's tests timed out");
  });
  it("refuses tests that turn green with no change after a red run, and keeps a resumed green", () => {
    strictEqual(greenProblem([], isTest, green, red),
      "the implementer changed no file, yet the tests that failed before now pass: a test that turns green by itself is flaky");
    strictEqual(greenProblem([], isTest, green, green), null);
  });
});

describe("readCost", () => {
  it("reads the line, and refuses none or a loop", () => {
    deepStrictEqual(readCost("done\nCost: 1 reads, 1 writes; none"), { ok: true, line: "Cost: 1 reads, 1 writes; none" });
    strictEqual(readCost("done").ok, false);
    strictEqual(readCost("Cost: 3 reads, 0 writes; a read in a loop over entries").ok, false);
  });
  it("clears a loop only in a where that says no port call sits in one", () => {
    strictEqual(readCost("Cost: 1 reads, 0 writes; no port call in a loop, a lambda or a memory filter").ok, true);
    strictEqual(readCost("Cost: 2 reads, 0 writes; nothing").ok, true);
    strictEqual(readCost("Cost: a port call in a loop, none in a lambda").ok, false);
    strictEqual(readCost("Cost: 3 reads in a loop; 1 write").ok, false);
    strictEqual(readCost("Cost: 1 reads, 0 writes; no port call in a loop, but one in a lambda").ok, false);
  });
});
