// A sub-agent's charter: its catalogue and the reasons it cannot run. Run:
//   node --test src/shared/domain/agents/charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { CHARTER_NAME, MAX_BRIEF_CHARS, MAX_CHARTER_ITERATIONS, charterCatalogue, charterProblems } from "./charter.ts";
import type { Charter } from "./charter.ts";

const reader = (over: Partial<Charter> = {}): Charter => ({
  name: "code-reader", role: "Reader", goal: "Read the code it is pointed at",
  mode: "plan",
  tools: ["file_read", "codebase_search", "symbol_detail", "symbol_source"],
  disallowed: [],
  maxIterations: 30,
  ...over,
});

describe("charterCatalogue", () => {
  it("keeps the read tools a plan charter lists, in its order", () => {
    deepStrictEqual(charterCatalogue(reader()), ["file_read", "codebase_search", "symbol_detail", "symbol_source"]);
  });

  it("removes the disallowed tools", () => {
    deepStrictEqual(charterCatalogue(reader({ disallowed: ["codebase_search"] })),
      ["file_read", "symbol_detail", "symbol_source"]);
  });

  it("drops a tool the mode does not offer", () => {
    deepStrictEqual(charterCatalogue(reader({ tools: ["file_read", "shell_command"] })), ["file_read"]);
  });
});

describe("charterProblems", () => {
  it("is empty for a read-only charter", () => {
    deepStrictEqual(charterProblems(reader()), []);
    deepStrictEqual(charterProblems(reader({ mode: "dontAsk" })), []);
  });

  it("refuses a charter in a mode that can write", () => {
    deepStrictEqual(charterProblems(reader({ mode: "default" })), [
      "charter code-reader: mode default can write; a sub-agent runs read-only (plan or dontAsk) for now",
    ]);
  });

  it("names a write tool the mode does not offer", () => {
    deepStrictEqual(charterProblems(reader({ tools: ["file_read", "file_write", "shell_command"] })), [
      "charter code-reader: file_write is not offered in mode plan",
      "charter code-reader: shell_command is not offered in mode plan",
    ]);
  });

  it("refuses an empty catalogue", () => {
    deepStrictEqual(charterProblems(reader({ tools: ["file_read"], disallowed: ["file_read"] })), [
      "charter code-reader: no tool left once the mode and the disallowed list apply",
    ]);
  });

  it("refuses 0 and 81 iterations, and keeps 1 and 80", () => {
    for (const k of [0, 81, 2.5]) {
      deepStrictEqual(charterProblems(reader({ maxIterations: k })), [
        `charter code-reader: maxIterations ${k} is not between 1 and 80`,
      ]);
    }
    deepStrictEqual(charterProblems(reader({ maxIterations: 1 })), []);
    deepStrictEqual(charterProblems(reader({ maxIterations: MAX_CHARTER_ITERATIONS })), []);
  });

  it("checks the name pattern", () => {
    ok(CHARTER_NAME.test("dev-auditor"));
    for (const bad of ["a", "Dev-auditor", "1st", "dev_auditor", "x".repeat(41)]) {
      deepStrictEqual(charterProblems(reader({ name: bad }))[0],
        `charter name '${bad}' is not a kebab-case name of 2 to 40 characters`);
    }
    ok(CHARTER_NAME.test("x".repeat(40)));
  });

  it("lists the problems in the frozen order", () => {
    const problems = charterProblems(reader({ name: "X", mode: "acceptEdits", tools: [], maxIterations: 0 }));
    deepStrictEqual(problems, [
      "charter name 'X' is not a kebab-case name of 2 to 40 characters",
      "charter X: mode acceptEdits can write; a sub-agent runs read-only (plan or dontAsk) for now",
      "charter X: no tool left once the mode and the disallowed list apply",
      "charter X: maxIterations 0 is not between 1 and 80",
    ]);
  });

  it("caps a brief at 24 000 characters", () => {
    strictEqual(MAX_BRIEF_CHARS, 24_000);
  });
});
