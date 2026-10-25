// The dev crews' call guard: the step's rule sets, a role's roots, the whole input of the folder readers, the
// act's mode when the host has no gate, and the /hooks declarations. Run:
//   node --test src/shared/domain/dev/call-guard.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildCallGuard, checkToolCall, denyText, hookCommand, normalisePath, shellOperatorIn, toolHooks,
} from "./call-guard.ts";
import type { CallGuardSpec } from "./call-guard.ts";
import { stepRules } from "./step-rules.ts";
import { assertAllowed, assertRefused, refused } from "./call-guard.assertions.ts";
import {
  AUTHOR_WRITABLE, BIG, CLIMBING_PATHS, DISGUISED_COMMANDS, EXISTING_FILE_FACTS, GATED_FACTS, GIT_CONFIG_READS,
  GIT_CONFIG_WRITES, HOOK, HOOK_COMMANDS, HOOK_REGISTRY, IMPLEMENTER_REFUSED, LAYOUT, NEW, NO_REWRITE_SPECS, NODE_EDITORS, NORMALISED, ON,
  OPERATORS, PILOT_ALLOWED, PILOT_REFUSED, PLAIN_COMMANDS, READ_ONLY_MODES, ROOT_READS, UNCOVERED, UNGATED_ALLOWED,
  UNGATED_REFUSED, UNNORMALISED_PATHS, UNREADABLE_BATCHES, off, op,
} from "./call-guard.fixtures.ts";
import { WORKSPACE } from "../vfs.ts";

describe("buildCallGuard", () => {
  it("holds the deny rules of the step's sets, as the gate gets them, each with its set", () => {
    // Arrange
    const spec = { step: "dev-plan" } as const;

    // Act
    const guard = buildCallGuard(spec);

    // Assert
    strictEqual(guard.rules.length, stepRules("dev-plan").length);
    ok(guard.rules.every((r) => r.rule.effect === "deny" && r.origin.kind === "set"));
    deepStrictEqual(guard.hooks, []);
    deepStrictEqual(guard.problems, []);
  });

  it("says which pack key a role's path rules miss", () => {
    // Arrange
    const spec = { step: "dev-verify", role: "implementer", layout: { domain: "src" } } as const;

    // Act
    const guard = buildCallGuard(spec);

    // Assert
    deepStrictEqual(guard.problems, ["the pack gives no layout.tests: no rule on it"]);
  });

  it("adds a role's path rules after the sets", () => {
    // Arrange
    const spec = { step: "dev-verify", role: "test-author", layout: LAYOUT } as const;

    // Act
    const author = buildCallGuard(spec);

    // Assert
    ok(author.rules.some((r) => r.origin.kind === "role" && r.rule.tool === "file_write" && r.rule.pattern === "src/domain/*"));
  });
});

describe("checkToolCall — rules", () => {
  for (const c of UNCOVERED) {
    it(`allows what no deny rule covers, and never reads an allow rule: ${c.label}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, ON);

      // Assert
      assertAllowed(verdict);
    });
  }

  it("refuses a call a set covers, naming the rule, the set and what to do instead", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "shell_command", { command: "git push origin main" }, ON);

    // Assert
    assertRefused(verdict);
    strictEqual(verdict.reason, "dev-plan: refused by 'deny shell_command command=*git push*' of the rule set git-readonly");
    strictEqual(verdict.context,
      "git commands that change the repository, its branches or its remotes are refused during /dev-plan: do without this call.");
  });

  it("denyText gives the reason, then the context", () => {
    // Arrange
    const verdict = refused(checkToolCall(buildCallGuard({ step: "dev-plan" }), "shell_command", { command: "git push origin main" }, ON));

    // Act
    const text = denyText(verdict);

    // Assert
    strictEqual(text, `${verdict.reason}\n${verdict.context}`);
  });

  it("refuses a write under the test-author's source roots, with the role's context line", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "src/domain/x.ts", content: "x" }, ON);

    // Assert
    assertRefused(verdict);
    strictEqual(verdict.reason, "dev-verify: refused by 'deny file_write path=src/domain/*' of the test-author's roots");
    strictEqual(verdict.context, "The test-author writes outside these roots only: write the tests, no source file.");
  });

  it("lets the test-author write a new test file", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "tests/x.test.ts", content: "x" }, NEW);

    // Assert
    assertAllowed(verdict);
  });

  it("refuses the test-author an edit_batch it cannot read", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "edit_batch", { operations: [] }, ON);

    // Assert
    assertRefused(verdict);
  });

  for (const path of UNNORMALISED_PATHS) {
    it(`refuses a covered path written with ./, // or .., by its normalised form: ${path}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, "file_write", { path, content: "x" }, ON);

      // Assert
      assertRefused(verdict, path);
    });
  }

  it("names the normalised form of a covered path in the refusal", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "./src/domain/x.ts", content: "x" }, ON);

    // Assert
    assertRefused(verdict);
    strictEqual(verdict.reason,
      "dev-verify: refused by 'deny file_write path=src/domain/*' of the test-author's roots, which 'src/domain/x.ts' is");
  });

  it("allows an uncovered path written with ./", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "./tests/x.test.ts", content: "x" }, NEW);

    // Assert
    assertAllowed(verdict);
  });

  for (const path of CLIMBING_PATHS) {
    it(`refuses a relative path that climbs out and back in with a leading .., by the path the host resolves: ${path}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-verify", role: "implementer", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, "edit_file", { path, old_string: "a", new_string: "b" }, ON);

      // Assert
      assertRefused(verdict, path);
      ok(verdict.reason.endsWith(`which '${WORKSPACE}/tests/a.test.ts' is`), verdict.reason);
    });
  }

  it("allows a relative path that climbs out and back in under a root left writable", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "implementer", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "edit_file", { path: "../workspace/src/a.ts", old_string: "a", new_string: "b" }, ON);

    // Assert
    assertAllowed(verdict);
  });

  for (const command of DISGUISED_COMMANDS) {
    it(`refuses a shell command a set covers once its quotes, repeated spaces and option clusters are read: ${JSON.stringify(command)}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, "shell_command", { command }, ON);

      // Assert
      assertRefused(verdict, command);
    });
  }

  it("names the command as read in the refusal", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "shell_command", { command: 'git "push" origin' }, ON);

    // Assert
    assertRefused(verdict);
    ok(verdict.reason.endsWith("of the rule set git-readonly, which 'git push origin' runs"), verdict.reason);
  });

  for (const command of PLAIN_COMMANDS) {
    it(`allows a shell command no set covers: ${command}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, "shell_command", { command }, ON);

      // Assert
      assertAllowed(verdict, command);
    });
  }

  for (const command of GIT_CONFIG_WRITES) {
    it(`refuses a git config that sets a value, which the gate's glob cannot tell from a read: ${command}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, "shell_command", { command }, ON);

      // Assert
      assertRefused(verdict, command);
      strictEqual(verdict.reason, "dev-plan: refused by 'deny shell_command command=*git config <key> <value>*' of the rule set git-readonly", command);
    });
  }

  for (const command of GIT_CONFIG_READS) {
    it(`lets a git config read run: ${command}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, "shell_command", { command }, ON);

      // Assert
      assertAllowed(verdict, command);
    });
  }

  for (const [path, normal] of NORMALISED) {
    it(`normalises a path by its text: ${path}`, () => {
      // Arrange
      const text = path;

      // Act
      const normalised = normalisePath(text);

      // Assert
      strictEqual(normalised, normal);
    });
  }

  it("reads an input that is not an object as no argument: a read runs", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "file_read", null, ON);

    // Assert
    assertAllowed(verdict);
  });

  it("reads an input that is not an object as no argument: a batch is refused", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "edit_batch", "x", ON);

    // Assert
    assertRefused(verdict);
  });
});

describe("checkToolCall — what a role's roots leave writable", () => {
  for (const c of AUTHOR_WRITABLE) {
    it(`lets the test author write a test file beside the code and a named stub, nothing else of its roots: ${c.label}`, () => {
      // Arrange
      const guard = buildCallGuard({
        step: "dev-implement", role: "test-author", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["src/domain/a.ts"],
      });

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, c.facts);

      // Assert
      strictEqual(verdict.allow, c.allow);
    });
  }

  it("keeps a rule set's deny whatever the role leaves writable", () => {
    // Arrange
    const sets = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: [".orkeon/state.json"] });

    // Act
    const verdict = checkToolCall(sets, "file_write", { path: ".orkeon/state.json" }, ON);

    // Assert
    assertRefused(verdict);
  });

  it("leaves the implementer nothing of its own denies", () => {
    // Arrange
    const spec: CallGuardSpec = { step: "dev-implement", role: "implementer", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["tests/a.ts"] };

    // Act
    const guard = buildCallGuard(spec);

    // Assert
    deepStrictEqual([guard.writable, guard.stubs], [[], []]);
  });

  for (const path of IMPLEMENTER_REFUSED) {
    it(`leaves the implementer nothing of its own denies: ${path} stays refused`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: { ...LAYOUT, testFiles: ["src/*.test.ts"] }, writable: ["tests/a.ts"] });

      // Act
      const verdict = checkToolCall(guard, "file_write", { path }, ON);

      // Assert
      assertRefused(verdict, path);
    });
  }

  it("compares the test author's stubs as paths, never as patterns: a pattern names no file", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: ["src/domain/*", "src/domain/a.ts"] });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "src/domain/core.ts" }, ON);

    // Assert
    assertRefused(verdict);
  });

  it("compares the test author's stubs as paths, never as patterns: a named stub is writable", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT, writable: ["src/domain/*", "src/domain/a.ts"] });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: `${WORKSPACE}/src/domain/a.ts` }, NEW);

    // Assert
    strictEqual(verdict.allow, true);
  });
});

describe("checkToolCall — the rewrite rule of a writing role", () => {
  for (const facts of EXISTING_FILE_FACTS) {
    it(`refuses file_write on an existing source file: ${JSON.stringify(facts)}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, "file_write", { path: BIG, content: "x" }, facts);

      // Assert
      assertRefused(verdict);
      strictEqual(verdict.reason, "dev-implement: refused by 'deny file_write path=src/domain/*' of the implementer's rewrite rule");
      ok(verdict.context.startsWith("This source file exists: change it by node (node_read for its sha256, then node_replace"), verdict.context);
    });
  }

  for (const tool of NODE_EDITORS) {
    it(`lets the node editors and edit_file change an existing source file: ${tool}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, tool, { path: BIG, text: "x" }, ON);

      // Assert
      assertAllowed(verdict, tool);
    });
  }

  it("lets file_write create a source file", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: `${WORKSPACE}/${BIG}`, content: "x" }, NEW);

    // Assert
    assertAllowed(verdict);
  });

  it("lets file_write rewrite a file outside the roots", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "docs/notes.md", content: "x" }, ON);

    // Assert
    assertAllowed(verdict);
  });

  it("holds for the test author on the test root", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: "tests/a.test.ts" }, ON);

    // Assert
    strictEqual(refused(verdict).reason,
      "dev-implement: refused by 'deny file_write path=tests/*' of the test-author's rewrite rule");
  });

  it("never lifts a role's own deny", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: BIG }, NEW);

    // Assert
    ok(refused(verdict).reason.endsWith("of the test-author's roots"));
  });

  it("never lifts a set's own deny", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-implement", role: "test-author", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_write", { path: ".orkeon/config.json" }, NEW);

    // Assert
    ok(refused(verdict).reason.endsWith("of the rule set state-files"));
  });

  for (const spec of NO_REWRITE_SPECS) {
    it(`is no rule of the pilot, nor of a step without a role: ${JSON.stringify(spec)}`, () => {
      // Arrange
      const roleless: CallGuardSpec = spec;

      // Act
      const guard = buildCallGuard(roleless);

      // Assert
      ok(!guard.rules.some((r) => r.origin.kind === "rewrite"));
    });
  }
});

describe("checkToolCall — edit_batch, operation by operation", () => {
  const implementer = buildCallGuard({ step: "dev-implement", role: "implementer", layout: LAYOUT });
  const batch = { operations: [op("node_replace", "src/domain/a.ts"), op("ensure_import", "src/app/b.ts"), op("node_insert", "docs/x.md")] };

  it("lets a batch through when every operation is one its editor may make", () => {
    // Arrange
    const input = batch;

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    assertAllowed(verdict);
  });

  it("lets a batch through with validate parse", () => {
    // Arrange
    const input = { ...batch, validate: "parse" };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    assertAllowed(verdict);
  });

  it("refuses the whole batch on the first operation a rule covers, naming it", () => {
    // Arrange
    const input = { operations: [op("node_replace", "src/domain/a.ts"), op("node_insert", "tests/a.test.ts")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    strictEqual(refused(verdict).reason,
      "dev-implement: refused by 'deny node_insert path=tests/*' of the implementer's roots (edit_batch operation 2, node_insert on 'tests/a.test.ts')");
  });

  it("refuses a batch whose operation writes a secret", () => {
    // Arrange
    const input = { operations: [op("ensure_member", "src/domain/a.ts", "k = 'ghp_x'")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    const secret = refused(verdict);
    ok(secret.reason.includes("of the rule set secrets (edit_batch operation 1, ensure_member"), secret.reason);
  });

  // An import's name and module are written text too.
  for (const field of ["name", "module"]) {
    it(`reads an import's ${field} as written text in a batch`, () => {
      // Arrange
      const input = { operations: [{ kind: "ensure_import", path: "src/app/b.ts", [field]: "ghp_x" }] };

      // Act
      const verdict = checkToolCall(implementer, "edit_batch", input, ON);

      // Assert
      const named = refused(verdict);
      ok(named.reason.includes(`node_ensure ${field}=*ghp_*`), named.reason);
    });

    it(`reads an import's ${field} as written text in node_ensure`, () => {
      // Arrange
      const input = { op: "ensure_import", path: "src/app/b.ts", [field]: "ghp_x" };

      // Act
      const verdict = checkToolCall(implementer, "node_ensure", input, ON);

      // Assert
      assertRefused(verdict);
    });
  }

  it("refuses a batch writing a state file", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "edit_batch", { operations: [op("replace_mermaid", ".orkeon/memory/x.md")] }, ON);

    // Assert
    const state = refused(verdict);
    ok(state.reason.includes("of the rule set state-files"), state.reason);
  });

  it("refuses a path normalised back under a denied root", () => {
    // Arrange
    const input = { operations: [op("node_replace", "src/../tests/a.test.ts")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    assertRefused(verdict);
  });

  for (const input of UNREADABLE_BATCHES) {
    it(`refuses a batch it cannot read: ${JSON.stringify(input)}`, () => {
      // Arrange
      const label = JSON.stringify(input);

      // Act
      const verdict = checkToolCall(implementer, "edit_batch", input, ON);

      // Assert
      ok(refused(verdict).reason.startsWith("dev-implement: edit_batch refused: "), label);
    });
  }

  it("refuses validate build", () => {
    // Arrange
    const input = { operations: [op("node_replace", "src/domain/a.ts")], validate: "build" };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, ON);

    // Assert
    const build = refused(verdict);
    strictEqual(build.reason, "dev-implement: edit_batch refused: validate 'build' is not run in a dev step");
    ok(build.context.includes("run_build"), build.context);
  });

  it("is an editor acceptEdits runs when the host has no gate", () => {
    // Arrange
    const input = { operations: [op("node_replace", "src/domain/a.ts")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, off("acceptEdits"));

    // Assert
    assertAllowed(verdict);
  });

  it("is still checked under acceptEdits when the host has no gate", () => {
    // Arrange
    const input = { operations: [op("node_replace", "tests/a.ts")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, off("acceptEdits"));

    // Assert
    assertRefused(verdict);
  });

  it("is no read plan runs when the host has no gate", () => {
    // Arrange
    const input = { operations: [op("node_replace", "src/domain/a.ts")] };

    // Act
    const verdict = checkToolCall(implementer, "edit_batch", input, off("plan"));

    // Assert
    assertRefused(verdict);
  });
});

describe("checkToolCall — the whole input of the folder readers", () => {
  it("refuses a glob pattern that names a denied folder from a parent path", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-plan" });

    // Act
    const verdict = checkToolCall(guard, "glob", { path: WORKSPACE, pattern: "node_modules/**" }, ON);

    // Assert
    assertRefused(verdict);
    ok(verdict.reason.endsWith(`of the rule set read-noise, which '${WORKSPACE}/node_modules/**' reaches`), verdict.reason);
  });

  // A noise filter only: a `**` from the root still runs.
  for (const c of ROOT_READS) {
    it(`lets a read from the root run: ${c.label}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-plan" });

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, ON);

      // Assert
      assertAllowed(verdict);
    });
  }

  for (const c of PILOT_REFUSED) {
    it(`refuses for a pilot every folder read that can reach below its roots: ${c.label}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-verify", role: "pilot", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, ON);

      // Assert
      assertRefused(verdict, c.label);
    });
  }

  it("refuses a pilot a source or test file named by its path", () => {
    // Arrange
    const guard = buildCallGuard({ step: "dev-verify", role: "pilot", layout: LAYOUT });

    // Act
    const verdict = checkToolCall(guard, "file_read", { path: `${WORKSPACE}/tests/a.test.ts` }, ON);

    // Assert
    strictEqual(refused(verdict).context, "The pilot opens no source or test file by its path: work from the batch sheet and the plan.");
  });

  // Outside the roots, or a literal path beside them.
  for (const c of PILOT_ALLOWED) {
    it(`lets a pilot read outside its roots, or a literal path beside them: ${c.label}`, () => {
      // Arrange
      const guard = buildCallGuard({ step: "dev-verify", role: "pilot", layout: LAYOUT });

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, ON);

      // Assert
      assertAllowed(verdict);
    });
  }
});

describe("checkToolCall — no gate on the host", () => {
  const guard = buildCallGuard({ step: "dev-plan", readTools: ["run_validation"] });

  for (const mode of READ_ONLY_MODES) {
    it(`lets ${mode} run the reads`, () => {
      // Arrange
      const facts = off(mode);

      // Act
      const verdict = checkToolCall(guard, "file_read", { path: "a" }, facts);

      // Assert
      assertAllowed(verdict);
    });

    it(`lets ${mode} run the crew's read tools`, () => {
      // Arrange
      const facts = off(mode);

      // Act
      const verdict = checkToolCall(guard, "run_validation", {}, facts);

      // Assert
      assertAllowed(verdict);
    });

    it(`lets ${mode} run the reads only`, () => {
      // Arrange
      const facts = off(mode);

      // Act
      const verdict = checkToolCall(guard, "file_write", { path: "a", content: "" }, facts);

      // Assert
      assertRefused(verdict);
      ok(verdict.reason.includes("the host has no permission gate"), verdict.reason);
      strictEqual(verdict.context, "Use the read tools only.");
    });
  }

  for (const c of UNGATED_ALLOWED) {
    it(`lets acceptEdits run the file editors too, and bypassPermissions everything but the rules: ${c.mode} ${c.label}`, () => {
      // Arrange
      const facts = off(c.mode);

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, facts);

      // Assert
      assertAllowed(verdict);
    });
  }

  it("refuses acceptEdits a shell command, naming what it runs", () => {
    // Arrange
    const facts = off("acceptEdits");

    // Act
    const verdict = checkToolCall(guard, "shell_command", { command: "ls" }, facts);

    // Assert
    strictEqual(refused(verdict).context, "Use the read tools and the file editors only.");
  });

  for (const c of UNGATED_REFUSED) {
    it(`refuses beyond what the mode runs, or what a rule covers: ${c.mode} ${c.label}`, () => {
      // Arrange
      const facts = off(c.mode);

      // Act
      const verdict = checkToolCall(guard, c.tool, c.input, facts);

      // Assert
      assertRefused(verdict);
    });
  }

  for (const facts of GATED_FACTS) {
    it(`leaves the mode to the gate when the host has one or cannot say: ${String(facts.gateEnabled)}`, () => {
      // Arrange
      const input = { command: "ls" };

      // Act
      const verdict = checkToolCall(guard, "shell_command", input, facts);

      // Assert
      assertAllowed(verdict);
    });
  }
});

describe("hooks", () => {
  it("keeps the pre-tool and post-tool declarations, numbered by their place in the registry", () => {
    // Arrange
    const registry = HOOK_REGISTRY;

    // Act
    const hooks = toolHooks(registry);

    // Assert
    deepStrictEqual(hooks, [
      { n: 2, event: "pre-tool", command: "bash a.sh" },
      { n: 5, event: "post-tool", command: "bash b.sh" },
    ]);
  });

  it("keeps no declaration without a registry", () => {
    // Arrange
    const registry = undefined;

    // Act
    const hooks = toolHooks(registry);

    // Assert
    deepStrictEqual(hooks, []);
  });

  it("keeps no declaration from a registry that is not a list", () => {
    // Arrange
    const registry = { event: "pre-tool", command: "x" };

    // Act
    const hooks = toolHooks(registry);

    // Assert
    deepStrictEqual(hooks, []);
  });

  for (const c of HOOK_COMMANDS) {
    it(`replaces {tool}, {event} and a plain {path}, and gives - for any other path: ${c.label}`, () => {
      // Arrange
      const hook = HOOK;

      // Act
      const command = hookCommand(hook, c.tool, c.input);

      // Assert
      strictEqual(command, c.command);
    });
  }

  for (const [command, operator] of OPERATORS) {
    it(`finds the operators the shell tool refuses: ${command}`, () => {
      // Arrange
      const text = command;

      // Act
      const found = shellOperatorIn(text);

      // Assert
      strictEqual(found, operator);
    });
  }
});
