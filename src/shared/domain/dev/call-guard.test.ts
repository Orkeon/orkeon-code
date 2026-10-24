// The dev crews' call guard: the step's rule sets, a role's roots, the whole input of the folder readers, the
// act's mode when the host has no gate, and the /hooks declarations. Run:
//   node --test src/shared/domain/dev/call-guard.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildCallGuard, checkToolCall, denyText, guardSummary, hookCommand, normalisePath, shellOperatorIn, toolHooks,
} from "./call-guard.ts";
import type { CallVerdict } from "./call-guard.ts";
import { stepRules } from "./step-rules.ts";

const ON = { mode: "plan", gateEnabled: true };
const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };

function refused(verdict: CallVerdict): Extract<CallVerdict, { allow: false }> {
  ok(!verdict.allow, "the call was allowed");
  return verdict as Extract<CallVerdict, { allow: false }>;
}

describe("buildCallGuard", () => {
  it("holds the deny rules of the step's sets, as the gate gets them, each with its set", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    // stepRules keeps once the deny on edit_batch that secrets and state-files both hold; the guard keeps both.
    strictEqual(guard.rules.length, stepRules("dev-plan").length + 1);
    ok(guard.rules.every((r) => r.rule.effect === "deny" && r.origin.kind === "set"));
    deepStrictEqual(guard.hooks, []);
    deepStrictEqual(guard.problems, []);
  });

  it("adds a role's path rules after the sets, and says which pack key is missing", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "implementer", layout: { domain: "src" } });
    deepStrictEqual(guard.problems, ["the pack gives no layout.tests: no rule on it"]);
    const author = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });
    ok(author.rules.some((r) => r.origin.kind === "role" && r.rule.tool === "file_write" && r.rule.pattern === "src/domain/*"));
    strictEqual(guardSummary(author).startsWith(`${author.rules.length} deny rules (git-readonly, `), true);
    ok(guardSummary(author).endsWith("test-author's roots), 0 pre-tool and 0 post-tool hooks"));
  });
});

describe("checkToolCall — rules", () => {
  it("allows what no deny rule covers, and never reads an allow rule", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    deepStrictEqual(checkToolCall(guard, "file_read", { path: "src/a.ts" }, ON), { allow: true });
    deepStrictEqual(checkToolCall(guard, "shell_command", { command: "git status" }, ON), { allow: true });
  });

  it("refuses a call a set covers, naming the rule, the set and what to do instead", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    const verdict = refused(checkToolCall(guard, "shell_command", { command: "git push origin main" }, ON));
    strictEqual(verdict.reason, "dev-plan: refused by 'deny shell_command command=*git push*' of the rule set git-readonly");
    strictEqual(verdict.context,
      "git commands that change the repository, its branches or its remotes are refused during /dev-plan: do without this call.");
    strictEqual(denyText(verdict), `${verdict.reason}\n${verdict.context}`);
  });

  it("refuses a write under the test-author's source roots, with the role's context line", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });
    const verdict = refused(checkToolCall(guard, "file_write", { path: "src/domain/x.ts", content: "x" }, ON));
    strictEqual(verdict.reason, "dev-verify: refused by 'deny file_write path=src/domain/*' of the test-author's roots");
    strictEqual(verdict.context, "The test-author writes outside these roots only: write the tests, no source file.");
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "tests/x.test.ts", content: "x" }, ON), { allow: true });
    refused(checkToolCall(guard, "edit_batch", { operations: [] }, ON));
  });

  it("refuses a covered path written with ./, // or .., by its normalised form", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });
    for (const path of ["./src/domain/x.ts", "src//domain/x.ts", "tests/../src/domain/x.ts", "/workspace/./src/domain/x.ts"]) {
      refused(checkToolCall(guard, "file_write", { path, content: "x" }, ON));
    }
    const verdict = refused(checkToolCall(guard, "file_write", { path: "./src/domain/x.ts", content: "x" }, ON));
    strictEqual(verdict.reason,
      "dev-verify: refused by 'deny file_write path=src/domain/*' of the test-author's roots, which 'src/domain/x.ts' is");
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "./tests/x.test.ts", content: "x" }, ON), { allow: true });
  });

  it("normalises a path by its text", () => {
    strictEqual(normalisePath("/workspace/./src//x.ts"), "/workspace/src/x.ts");
    strictEqual(normalisePath("/workspace/tests/../src/x.ts"), "/workspace/src/x.ts");
    strictEqual(normalisePath("./src/x.ts"), "src/x.ts");
    strictEqual(normalisePath("../x"), "../x");
    strictEqual(normalisePath("/../workspace/x"), "/workspace/x");
    strictEqual(normalisePath("./"), ".");
  });

  it("reads an input that is not an object as no argument", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    deepStrictEqual(checkToolCall(guard, "file_read", null, ON), { allow: true });
    refused(checkToolCall(guard, "edit_batch", "x", ON));
  });
});

describe("checkToolCall — what a role's roots leave writable", () => {
  it("lets the test author write a test file beside the code and a named stub, nothing else of its roots", () => {
    const guard = buildCallGuard({
      step: "dev-implement", role: "test-author", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["src/domain/a.ts"],
    });
    strictEqual(checkToolCall(guard, "file_write", { path: "/workspace/src/domain/a.test.ts" }, ON).allow, true);
    strictEqual(checkToolCall(guard, "edit_file", { path: "./src/domain/a.ts" }, ON).allow, true);
    refused(checkToolCall(guard, "file_write", { path: "src/domain/b.ts" }, ON));
    // A rule set's deny holds whatever the role leaves writable.
    const sets = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: [".orkeon/state.json"] });
    refused(checkToolCall(sets, "file_write", { path: ".orkeon/state.json" }, ON));
  });
  it("leaves the implementer nothing of its own denies", () => {
    const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["tests/a.ts"] });
    deepStrictEqual(guard.writable, ["tests/a.ts"]);
    refused(checkToolCall(guard, "file_write", { path: "src/domain/a.test.ts" }, ON));
  });
});

describe("checkToolCall — the whole input of the folder readers", () => {
  it("refuses a glob pattern that names a denied folder from a parent path", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    const verdict = refused(checkToolCall(guard, "glob", { path: "/workspace", pattern: "node_modules/**" }, ON));
    ok(verdict.reason.endsWith("of the rule set read-noise, which '/workspace/node_modules/**' reaches"), verdict.reason);
    // A noise filter only: a `**` from the root still runs.
    deepStrictEqual(checkToolCall(guard, "glob", { path: "/workspace", pattern: "**/*.ts" }, ON), { allow: true });
    deepStrictEqual(checkToolCall(guard, "grep", { path: "/workspace", pattern: "x" }, ON), { allow: true });
  });

  it("refuses for a pilot every folder read that can reach below its roots", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "pilot", layout: LAYOUT });
    refused(checkToolCall(guard, "glob", { path: "/workspace", pattern: "**/*.ts" }, ON));
    refused(checkToolCall(guard, "glob", { path: "/workspace/src", pattern: "*/x.ts" }, ON));
    refused(checkToolCall(guard, "glob", { pattern: "**" }, ON));
    refused(checkToolCall(guard, "grep", { path: "/workspace", pattern: "TODO" }, ON));
    refused(checkToolCall(guard, "grep", { path: "src", pattern: "TODO", glob: "**/*.ts" }, ON));
    refused(checkToolCall(guard, "count_pattern", { path: "/workspace", patterns: ["x"] }, ON));
    const plain = refused(checkToolCall(guard, "file_read", { path: "/workspace/tests/a.test.ts" }, ON));
    strictEqual(plain.context, "The pilot opens no source or test file by its path: work from the batch sheet and the plan.");
    // Outside the roots, or a literal path beside them.
    deepStrictEqual(checkToolCall(guard, "glob", { path: "/workspace/docs", pattern: "**/*.md" }, ON), { allow: true });
    deepStrictEqual(checkToolCall(guard, "grep", { path: "docs", pattern: "x", glob: "*.md" }, ON), { allow: true });
    deepStrictEqual(checkToolCall(guard, "glob", { path: "/workspace", pattern: "README.md" }, ON), { allow: true });
  });
});

describe("checkToolCall — no gate on the host", () => {
  const guard = buildCallGuard({ step: "dev-plan", readTools: ["run_validation"] });
  const off = (mode: string) => ({ mode, gateEnabled: false });

  it("lets plan, dontAsk and default run the reads only, the crew's read tools among them", () => {
    for (const mode of ["plan", "dontAsk", "default", "unknown"]) {
      deepStrictEqual(checkToolCall(guard, "file_read", { path: "a" }, off(mode)), { allow: true });
      deepStrictEqual(checkToolCall(guard, "run_validation", {}, off(mode)), { allow: true });
      const verdict = refused(checkToolCall(guard, "file_write", { path: "a", content: "" }, off(mode)));
      ok(verdict.reason.includes("the host has no permission gate"), verdict.reason);
      strictEqual(verdict.context, "Use the read tools only.");
    }
  });

  it("lets acceptEdits run the file editors too, and bypassPermissions everything but the rules", () => {
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "a", content: "" }, off("acceptEdits")), { allow: true });
    deepStrictEqual(checkToolCall(guard, "spawn_agent", {}, off("acceptEdits")), { allow: true });
    strictEqual(refused(checkToolCall(guard, "shell_command", { command: "ls" }, off("acceptEdits"))).context,
      "Use the read tools and the file editors only.");
    refused(checkToolCall(guard, "github", { action: "create_pr" }, off("acceptEdits")));
    deepStrictEqual(checkToolCall(guard, "shell_command", { command: "ls" }, off("bypassPermissions")), { allow: true });
    refused(checkToolCall(guard, "shell_command", { command: "git push" }, off("bypassPermissions")));
  });

  it("leaves the mode to the gate when the host has one or cannot say", () => {
    deepStrictEqual(checkToolCall(guard, "shell_command", { command: "ls" }, { mode: "plan", gateEnabled: true }), { allow: true });
    deepStrictEqual(checkToolCall(guard, "shell_command", { command: "ls" }, { mode: "plan", gateEnabled: undefined }), { allow: true });
  });
});

describe("hooks", () => {
  it("keeps the pre-tool and post-tool declarations, numbered by their place in the registry", () => {
    deepStrictEqual(toolHooks([
      { event: "stop", command: "x" }, { event: "pre-tool", command: " bash a.sh " }, null, { event: "post-tool", command: "" },
      { event: "post-tool", command: "bash b.sh" }, "junk", { event: "pre-tool" },
    ]), [
      { n: 2, event: "pre-tool", command: "bash a.sh" },
      { n: 5, event: "post-tool", command: "bash b.sh" },
    ]);
    deepStrictEqual(toolHooks(undefined), []);
    deepStrictEqual(toolHooks({ event: "pre-tool", command: "x" }), []);
  });

  it("replaces {tool}, {event} and a plain {path}, and gives - for any other path", () => {
    const hook = { n: 1, event: "pre-tool" as const, command: "bash h.sh {event} {tool} {path}" };
    strictEqual(hookCommand(hook, "file_write", { path: "src/x.ts" }), "bash h.sh pre-tool file_write src/x.ts");
    strictEqual(hookCommand(hook, "file_write", { path: "a b; rm" }), "bash h.sh pre-tool file_write -");
    strictEqual(hookCommand(hook, "shell_command", { command: "ls" }), "bash h.sh pre-tool shell_command -");
    strictEqual(hookCommand(hook, "file_write", { path: "-rf" }), "bash h.sh pre-tool file_write -");
  });

  it("finds the operators the shell tool refuses", () => {
    strictEqual(shellOperatorIn("bash .orkeon/hooks/pre.sh {tool} {path}"), undefined);
    strictEqual(shellOperatorIn("echo x >> log"), ">>");
    strictEqual(shellOperatorIn("a && b"), "&&");
    strictEqual(shellOperatorIn("a; b"), ";");
    strictEqual(shellOperatorIn("a | b"), "|");
  });
});
