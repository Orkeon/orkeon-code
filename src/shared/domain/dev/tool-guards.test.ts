// The guard chain of Orkeon Code's own tools: order, first refusal, a throwing guard
// refuses; the rule guard reads the rules as the gate does; arguments and tails. Run:
//   node --test src/shared/domain/dev/tool-guards.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

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
    strictEqual(guard("git config user.name x"), "the rules of this step deny the shell command 'git config user.name x'");
    strictEqual(guard("git config --file a.cfg --list"), null);
    strictEqual(shellRuleGuard(rulesOf(["inline-interpreters"]))("git config user.name x"), null);
  });

  it("refuses the command in the form the program receives it: quotes and repeated spaces gone", () => {
    const guard = shellRuleGuard(rulesOf(["git-readonly", "inline-interpreters"]));
    strictEqual(guard('git "push" origin'), "the rules of this step deny the shell command 'git \"push\" origin'");
    ok(guard("python3 -Ic x") !== null);
    for (const command of ['python3 -Ic"print(1)"', "python3 -Icprint(1)", 'perl -we"print 1"', 'perl -wE"say 1"', 'ruby -we"p 1"']) {
      ok(guard(command) !== null, command);
    }
    strictEqual(guard("ls -la"), null);
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
