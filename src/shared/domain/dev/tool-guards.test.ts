// The guard chain of Orkeon Code's own tools: order, first refusal, a throwing guard
// refuses; the rule guard reads the rules as the gate does; arguments and tails. Run:
//   node --test src/shared/domain/dev/tool-guards.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { outputTail, runGuards, shellRuleGuard, stringArgument } from "./tool-guards.ts";
import type { Guard } from "./tool-guards.ts";
import { rulesOf } from "../agent-policy/rule-sets.ts";

describe("runGuards", () => {
  it("passes when every guard passes, and stops at the first refusal", () => {
    const seen: string[] = [];
    const pass = (name: string): Guard<string> => () => { seen.push(name); return null; };
    const refuse = (name: string): Guard<string> => () => { seen.push(name); return `${name} refuses`; };
    strictEqual(runGuards([pass("a"), pass("b")], "x"), null);
    strictEqual(runGuards([pass("a"), refuse("b"), refuse("c")], "x"), "b refuses");
    deepStrictEqual(seen, ["a", "b", "a", "b"]);
  });

  it("refuses when a guard throws", () => {
    const boom: Guard<string> = () => { throw new Error("bad pattern"); };
    strictEqual(runGuards([boom], "x"), "a guard failed: bad pattern");
  });
});

describe("shellRuleGuard", () => {
  it("refuses a command a deny rule of the step covers, and lets the others through", () => {
    const guard = shellRuleGuard(rulesOf(["git-readonly"]));
    strictEqual(guard("git push origin main"), "the rules of this step deny the shell command 'git push origin main'");
    strictEqual(guard("dotnet test tests/A.Tests"), null);
  });

  it("does not refuse what an allow rule alone covers", () => {
    strictEqual(shellRuleGuard([{ effect: "allow", tool: "shell_command" }])("npm test"), null);
  });
});

describe("stringArgument", () => {
  it("reads one line of at most 400 characters, trimmed", () => {
    deepStrictEqual(stringArgument({ command: " npm test " }, "command", true), { value: "npm test" });
    deepStrictEqual(stringArgument({}, "project", false), {});
    deepStrictEqual(stringArgument(null, "command", true), { refused: "'command' is required" });
    deepStrictEqual(stringArgument({ command: 3 }, "command", true), { refused: "'command' is not a string" });
    deepStrictEqual(stringArgument({ command: "a\nb" }, "command", true),
      { refused: "'command' is not one line of at most 400 characters" });
    deepStrictEqual(stringArgument({ command: "x".repeat(401) }, "command", true),
      { refused: "'command' is not one line of at most 400 characters" });
  });
});

describe("outputTail", () => {
  it("keeps the last 15 lines, stderr after stdout, at most 1 500 characters", () => {
    const out = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const tail = outputTail(out, "boom\n");
    strictEqual(tail.split("\n").length, 15);
    strictEqual(tail.split("\n").at(-1), "boom");
    strictEqual(outputTail("x".repeat(3_000), "").length, 1_500);
    strictEqual(outputTail("", ""), "");
  });
});
