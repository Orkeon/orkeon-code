// The dev crews' call guard: the step's rule sets, a role's roots, the whole input of the folder readers, the
// act's mode when the host has no gate, and the /hooks declarations. Run:
//   node --test src/shared/domain/dev/call-guard.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildCallGuard, checkToolCall, denyText, hookCommand, normalisePath, shellOperatorIn, toolHooks,
} from "./call-guard.ts";
import type { CallVerdict } from "./call-guard.ts";
import { stepRules } from "./step-rules.ts";

const ON = { mode: "plan", gateEnabled: true };
/** A file_write whose path the callbacks found absent: the rewrite rule does not hold on it. */
const NEW = { ...ON, newFile: true };
const LAYOUT = { domain: "src/domain", application: "src/app", infrastructure: "src/infra", tests: "tests" };

function refused(verdict: CallVerdict): Extract<CallVerdict, { allow: false }> {
  ok(!verdict.allow, "the call was allowed");
  return verdict as Extract<CallVerdict, { allow: false }>;
}

describe("buildCallGuard", () => {
  it("holds the deny rules of the step's sets, as the gate gets them, each with its set", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    strictEqual(guard.rules.length, stepRules("dev-plan").length);
    ok(guard.rules.every((r) => r.rule.effect === "deny" && r.origin.kind === "set"));
    deepStrictEqual(guard.hooks, []);
    deepStrictEqual(guard.problems, []);
  });

  it("adds a role's path rules after the sets, and says which pack key is missing", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "implementer", layout: { domain: "src" } });
    deepStrictEqual(guard.problems, ["the pack gives no layout.tests: no rule on it"]);
    const author = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });
    ok(author.rules.some((r) => r.origin.kind === "role" && r.rule.tool === "file_write" && r.rule.pattern === "src/domain/*"));
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
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "tests/x.test.ts", content: "x" }, NEW), { allow: true });
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
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "./tests/x.test.ts", content: "x" }, NEW), { allow: true });
  });

  it("refuses a relative path that climbs out and back in with a leading .., by the path the host resolves", () => {
    const guard = buildCallGuard({ step: "dev-verify", role: "implementer", layout: LAYOUT });
    for (const path of ["../workspace/tests/a.test.ts", "../../workspace/tests/a.test.ts", "src/../../workspace/tests/a.test.ts"]) {
      const verdict = refused(checkToolCall(guard, "edit_file", { path, old_string: "a", new_string: "b" }, ON));
      ok(verdict.reason.endsWith("which '/workspace/tests/a.test.ts' is"), verdict.reason);
    }
    deepStrictEqual(checkToolCall(guard, "edit_file", { path: "../workspace/src/a.ts", old_string: "a", new_string: "b" }, ON), { allow: true });
  });

  it("refuses a shell command a set covers once its quotes, repeated spaces and option clusters are read", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    for (const command of [
      'git "push" origin', "git\tpush", "git 'commit' -m x", "bash  -c x", "python3 -Ic x", "perl -we x",
      "python3.12 -c x", "git pu\\sh", "node -pe 1",
    ]) {
      refused(checkToolCall(guard, "shell_command", { command }, ON));
    }
    const verdict = refused(checkToolCall(guard, "shell_command", { command: 'git "push" origin' }, ON));
    ok(verdict.reason.endsWith("of the rule set git-readonly, which 'git push origin' runs"), verdict.reason);
    for (const command of ["git status", 'git log --format="%h %s"', "python3 -m pytest -x", "npm test"]) {
      deepStrictEqual(checkToolCall(guard, "shell_command", { command }, ON), { allow: true }, command);
    }
  });

  it("refuses a git config that sets a value, which the gate's glob cannot tell from a read, and lets the reads run", () => {
    const guard = buildCallGuard({ step: "dev-plan" });
    for (const command of ["git config user.name x", "git -C /x config --file a.cfg a.b c", "cd x && git config 'a.b' c"]) {
      const verdict = refused(checkToolCall(guard, "shell_command", { command }, ON));
      strictEqual(verdict.reason, "dev-plan: refused by 'deny shell_command command=*git config <key> <value>*' of the rule set git-readonly", command);
    }
    for (const command of ["git config --file a.cfg --list", "git config -f .gitmodules --get submodule.x.path", "git config user.name"]) {
      deepStrictEqual(checkToolCall(guard, "shell_command", { command }, ON), { allow: true }, command);
    }
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
    strictEqual(checkToolCall(guard, "file_write", { path: "/workspace/src/domain/a.test.ts" }, NEW).allow, true);
    strictEqual(checkToolCall(guard, "edit_file", { path: "./src/domain/a.ts" }, ON).allow, true);
    refused(checkToolCall(guard, "file_write", { path: "src/domain/b.ts" }, ON));
    // A rule set's deny holds whatever the role leaves writable.
    const sets = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: [".orkeon/state.json"] });
    refused(checkToolCall(sets, "file_write", { path: ".orkeon/state.json" }, ON));
  });
  it("leaves the implementer nothing of its own denies", () => {
    const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["tests/a.ts"] });
    deepStrictEqual([guard.writable, guard.stubs], [[], []]);
    refused(checkToolCall(guard, "file_write", { path: "tests/a.ts" }, ON));
    refused(checkToolCall(guard, "file_write", { path: "src/domain/a.test.ts" }, ON));
  });
  it("compares the test author's stubs as paths, never as patterns", () => {
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: ["src/domain/*", "src/domain/a.ts"] });
    refused(checkToolCall(guard, "file_write", { path: "src/domain/core.ts" }, ON));
    strictEqual(checkToolCall(guard, "file_write", { path: "/workspace/src/domain/a.ts" }, NEW).allow, true);
  });
});

describe("checkToolCall — the rewrite rule of a writing role", () => {
  const big = "src/domain/Orders.ts";

  it("refuses file_write on an existing source file, the node editors and edit_file not", () => {
    const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });
    for (const facts of [ON, { ...ON, newFile: false }]) {
      const verdict = refused(checkToolCall(guard, "file_write", { path: big, content: "x" }, facts));
      strictEqual(verdict.reason, "dev-implement: refused by 'deny file_write path=src/domain/*' of the implementer's rewrite rule");
      ok(verdict.context.startsWith("This source file exists: change it by node (node_read for its sha256, then node_replace"), verdict.context);
    }
    for (const tool of ["node_replace", "node_insert", "node_ensure", "edit_file"]) {
      deepStrictEqual(checkToolCall(guard, tool, { path: big, text: "x" }, ON), { allow: true }, tool);
    }
    deepStrictEqual(checkToolCall(guard, "file_write", { path: `/workspace/${big}`, content: "x" }, NEW), { allow: true });
    deepStrictEqual(checkToolCall(guard, "file_write", { path: "docs/notes.md", content: "x" }, ON), { allow: true });
  });

  it("holds for the test author on the test root, and never lifts a role's or a set's own deny", () => {
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT });
    strictEqual(refused(checkToolCall(guard, "file_write", { path: "tests/a.test.ts" }, ON)).reason,
      "dev-implement: refused by 'deny file_write path=tests/*' of the test-author's rewrite rule");
    ok(refused(checkToolCall(guard, "file_write", { path: big }, NEW)).reason.endsWith("of the test-author's roots"));
    ok(refused(checkToolCall(guard, "file_write", { path: ".orkeon/config.json" }, NEW)).reason.endsWith("of the rule set state-files"));
  });

  it("is no rule of the pilot, nor of a step without a role", () => {
    for (const guard of [buildCallGuard({ step: "dev-plan" }), buildCallGuard({ step: "dev-verify", role: "pilot", layout: LAYOUT })]) {
      ok(!guard.rules.some((r) => r.origin.kind === "rewrite"));
    }
  });
});

describe("checkToolCall — edit_batch, operation by operation", () => {
  const implementer = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });
  const op = (kind: string, path: string, text = "x") => ({ kind, path, selector: "A.b()", text, expected_hash: "h" });

  it("lets a batch through when every operation is one its editor may make", () => {
    const batch = { operations: [op("node_replace", "src/domain/a.ts"), op("ensure_import", "src/app/b.ts"), op("node_insert", "docs/x.md")] };
    deepStrictEqual(checkToolCall(implementer, "edit_batch", batch, ON), { allow: true });
    deepStrictEqual(checkToolCall(implementer, "edit_batch", { ...batch, validate: "parse" }, ON), { allow: true });
  });

  it("refuses the whole batch on the first operation a rule covers, naming it", () => {
    const onTests = refused(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "src/domain/a.ts"), op("node_insert", "tests/a.test.ts")] }, ON));
    strictEqual(onTests.reason,
      "dev-implement: refused by 'deny node_insert path=tests/*' of the implementer's roots (edit_batch operation 2, node_insert on 'tests/a.test.ts')");
    const secret = refused(checkToolCall(implementer, "edit_batch", { operations: [op("ensure_member", "src/domain/a.ts", "k = 'ghp_x'")] }, ON));
    ok(secret.reason.includes("of the rule set secrets (edit_batch operation 1, ensure_member"), secret.reason);
    // An import's name and module are written text too.
    for (const field of ["name", "module"]) {
      const named = refused(checkToolCall(implementer, "edit_batch", { operations: [{ kind: "ensure_import", path: "src/app/b.ts", [field]: "ghp_x" }] }, ON));
      ok(named.reason.includes(`node_ensure ${field}=*ghp_*`), named.reason);
      refused(checkToolCall(implementer, "node_ensure", { op: "ensure_import", path: "src/app/b.ts", [field]: "ghp_x" }, ON));
    }
    const state = refused(checkToolCall(buildCallGuard({ step: "dev-plan" }), "edit_batch", { operations: [op("replace_mermaid", ".orkeon/memory/x.md")] }, ON));
    ok(state.reason.includes("of the rule set state-files"), state.reason);
    // A path normalised back under a denied root is still refused.
    refused(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "src/../tests/a.test.ts")] }, ON));
  });

  it("refuses a batch it cannot read, and validate build", () => {
    for (const input of [{}, { operations: [] }, { operations: "x" }, { operations: [null] }, { operations: [{ kind: "node_replace" }] },
      { operations: [op("delete_file", "src/domain/a.ts")] }, "x"]) {
      ok(refused(checkToolCall(implementer, "edit_batch", input, ON)).reason.startsWith("dev-implement: edit_batch refused: "), JSON.stringify(input));
    }
    const build = refused(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "src/domain/a.ts")], validate: "build" }, ON));
    strictEqual(build.reason, "dev-implement: edit_batch refused: validate 'build' is not run in a dev step");
    ok(build.context.includes("run_build"), build.context);
  });

  it("is an editor acceptEdits runs when the host has no gate, and still checked", () => {
    const off = { mode: "acceptEdits", gateEnabled: false };
    deepStrictEqual(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "src/domain/a.ts")] }, off), { allow: true });
    refused(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "tests/a.ts")] }, off));
    refused(checkToolCall(implementer, "edit_batch", { operations: [op("node_replace", "src/domain/a.ts")] }, { mode: "plan", gateEnabled: false }));
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
