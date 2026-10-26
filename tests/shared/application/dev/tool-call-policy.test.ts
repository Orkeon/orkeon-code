// The tool-call decision of the dev crews over probes that record what they were asked. Run:
//   node --test src/shared/application/dev/tool-call-policy.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { judgeToolCall, memoryDenyText } from "../../../../src/shared/application/dev/tool-call-policy.ts";
import {
  BYPASS_ACT, EDITS_ACT, GIT_COMMIT_DENY, HOOK_FAILED, HOOK_FAILED_DENY, MEMORY_DENY_X, MOUNT_STOPPED, MOUNT_STOPPED_DENY,
  NEW_FILE_QUESTIONS, PLAN_ACT, PRE, RESOLVED_NOTE, TWO, UNREADABLE_MEMORY_WRITES, implementerGuard, planGuard, probes,
} from "./tool-call-policy.fixtures.ts";
import { assertRefused, assertRefusedWith } from "./tool-call-policy.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("judgeToolCall — the path", () => {
  it("resolves a relative path under the checkout: the hooks see it resolved, and the call runs with it", async () => {
    // Arrange
    const asking = probes();

    // Act
    const { verdict } = await judgeToolCall(planGuard([PRE]), { name: "file_read", input: { path: "src/a.ts" } }, PLAN_ACT, asking);

    // Assert
    deepStrictEqual(verdict, { input: { path: `${WORKSPACE}/src/a.ts` } });
    deepStrictEqual(asking.asked.hooks, [{ n: 1, tool: "file_read", input: { path: `${WORKSPACE}/src/a.ts` } }]);
  });

  it("resolves each relative operation of an edit_batch", async () => {
    // Arrange
    const input = { operations: [{ kind: "node_replace", path: "src/a.ts", text: "x" }, { kind: "node_insert", path: `${WORKSPACE}/docs/b.md`, text: "y" }] };

    // Act
    const { verdict } = await judgeToolCall(planGuard(), { name: "edit_batch", input }, PLAN_ACT, probes());

    // Assert
    deepStrictEqual(verdict, { input: { operations: [{ kind: "node_replace", path: `${WORKSPACE}/src/a.ts`, text: "x" }, { kind: "node_insert", path: `${WORKSPACE}/docs/b.md`, text: "y" }] } });
  });

  it("judges and hooks the resolved path", async () => {
    // Arrange
    const asking = probes({ newFile: true });

    // Act
    await judgeToolCall(implementerGuard([PRE]), { name: "file_write", input: { path: "src/domain/a.ts", content: "y" } }, EDITS_ACT, asking);

    // Assert
    deepStrictEqual(
      [asking.asked.newFile, asking.asked.hooks.map((h) => h.input)],
      [[`${WORKSPACE}/src/domain/a.ts`], [{ path: `${WORKSPACE}/src/domain/a.ts`, content: "y" }]],
    );
  });

  it("returns the resolved input when allowed, with a note that the path was resolved", async () => {
    // Arrange
    const call = { name: "file_read", input: { path: "src/a.ts" } };

    // Act
    const judgement = await judgeToolCall(planGuard(), call, PLAN_ACT, probes());

    // Assert
    deepStrictEqual(judgement, { verdict: { input: { path: `${WORKSPACE}/src/a.ts` } }, notes: [RESOLVED_NOTE] });
  });
});

describe("judgeToolCall — the guard", () => {
  it("refuses a call a rule covers with the reason and its context line, and runs no hook", async () => {
    // Arrange
    const asking = probes();

    // Act
    const judgement = await judgeToolCall(planGuard([PRE]), { name: "shell_command", input: { command: "git commit -m x" } }, PLAN_ACT, asking);

    // Assert
    deepStrictEqual(judgement.verdict, { deny: GIT_COMMIT_DENY });
    deepStrictEqual(asking.asked.hooks, []);
    ok(judgement.notes[0].startsWith("dev-plan: callback refused shell_command: "), judgement.notes[0]);
  });

  it("applies the act's mode itself when the host has no gate: plan refuses a write", async () => {
    // Arrange
    const act = { mode: "plan", gateEnabled: false };

    // Act
    const judgement = await judgeToolCall(planGuard(), { name: "file_write", input: { path: "a" } }, act, probes());

    // Assert
    assertRefused(judgement, ["the host has no permission gate"]);
  });

  it("applies the act's mode itself when the host has no gate: acceptEdits allows a write", async () => {
    // Arrange
    const act = { mode: "acceptEdits", gateEnabled: false };

    // Act
    const { verdict } = await judgeToolCall(planGuard(), { name: "file_write", input: { path: `${WORKSPACE}/a` } }, act, probes());

    // Assert
    strictEqual(verdict, "allow");
  });

  it("refuses with the step's name when the guard itself throws", async () => {
    // Arrange
    const input = { get path(): string { throw new Error("boom"); } };

    // Act
    const { verdict } = await judgeToolCall(planGuard(), { name: "file_read", input }, PLAN_ACT, probes());

    // Assert
    deepStrictEqual(verdict, { deny: "dev-plan: the callback failed: boom" });
  });

  it("turns a throwing probe into a refusal led by the step's name, the notes already taken kept", async () => {
    // Arrange
    const asking = probes({ hookThrows: "boom" });

    // Act
    const judgement = await judgeToolCall(planGuard([PRE]), { name: "file_read", input: { path: "src/a.ts" } }, PLAN_ACT, asking);

    // Assert
    deepStrictEqual(judgement, { verdict: { deny: "dev-plan: the callback failed: boom" }, notes: [RESOLVED_NOTE] });
  });
});

describe("judgeToolCall — the pre-tool hooks", () => {
  it("refuses at the first pre-tool hook that fails, and runs none after it", async () => {
    // Arrange
    const asking = probes({ failures: { 1: HOOK_FAILED } });

    // Act
    const judgement = await judgeToolCall(planGuard([PRE, TWO]), { name: "file_read", input: { path: `${WORKSPACE}/a.ts` } }, PLAN_ACT, asking);

    // Assert
    assertRefused(judgement, ["pre-tool hook #1"]);
    deepStrictEqual(asking.asked.hooks.map((h) => h.n), [1]);
  });

  it("refuses with the hook text when the hook failed", async () => {
    // Arrange
    const asking = probes({ failures: { 1: HOOK_FAILED } });

    // Act
    const judgement = await judgeToolCall(planGuard([PRE]), { name: "file_read", input: { path: `${WORKSPACE}/a.ts` } }, PLAN_ACT, asking);

    // Assert
    deepStrictEqual(judgement, { verdict: { deny: HOOK_FAILED_DENY }, notes: ["dev-plan: pre-tool hook #1 refused file_read"] });
  });

  it("refuses with the mount-check text when the runtime stopped the hook", async () => {
    // Arrange
    const asking = probes({ failures: { 1: MOUNT_STOPPED } });

    // Act
    const judgement = await judgeToolCall(planGuard([PRE]), { name: "directory_read", input: { path: "/crews" } }, PLAN_ACT, asking);

    // Assert
    deepStrictEqual(judgement, {
      verdict: { deny: MOUNT_STOPPED_DENY },
      notes: ["dev-plan: the runtime's mount check refused pre-tool hook #1 for directory_read"],
    });
  });
});

describe("judgeToolCall — the rewrite rule", () => {
  it("refuses file_write on a source file that exists", async () => {
    // Arrange
    const asking = probes({ newFile: false });

    // Act
    const judgement = await judgeToolCall(implementerGuard(), { name: "file_write", input: { path: `${WORKSPACE}/src/domain/big.ts`, content: "y" } }, EDITS_ACT, asking);

    // Assert
    assertRefused(judgement, ["of the implementer's rewrite rule"]);
    deepStrictEqual(asking.asked.newFile, [`${WORKSPACE}/src/domain/big.ts`]);
  });

  it("lets file_write create a file the probe calls new under a rewrite rule", async () => {
    // Arrange
    const asking = probes({ newFile: true });

    // Act
    const { verdict } = await judgeToolCall(implementerGuard(), { name: "file_write", input: { path: "./src/domain/new.ts", content: "y" } }, EDITS_ACT, asking);

    // Assert
    deepStrictEqual(verdict, { input: { path: `${WORKSPACE}/src/domain/new.ts`, content: "y" } });
    deepStrictEqual(asking.asked.newFile, [`${WORKSPACE}/src/domain/new.ts`]);
  });

  it("lets a node edit change a source file that exists, asking nothing", async () => {
    // Arrange
    const asking = probes({ newFile: false });
    const input = { path: `${WORKSPACE}/src/domain/big.ts`, selector: "A.b()", text: "y", expected_hash: "h" };

    // Act
    const { verdict } = await judgeToolCall(implementerGuard(), { name: "node_replace", input }, EDITS_ACT, asking);

    // Assert
    strictEqual(verdict, "allow");
    deepStrictEqual(asking.asked.newFile, []);
  });

  it("keeps the rewrite rule when the probe cannot tell", async () => {
    // Arrange
    const asking = probes();

    // Act
    const judgement = await judgeToolCall(implementerGuard(), { name: "file_write", input: { path: `${WORKSPACE}/src/domain/a.ts`, content: "y" } }, EDITS_ACT, asking);

    // Assert
    assertRefused(judgement, ["of the implementer's rewrite rule"]);
  });

  it("asks nothing for a step without a writing role", async () => {
    // Arrange
    const asking = probes();

    // Act
    const { verdict } = await judgeToolCall(planGuard(), { name: "file_write", input: { path: `${WORKSPACE}/src/domain/a.ts`, content: "y" } }, EDITS_ACT, asking);

    // Assert
    strictEqual(verdict, "allow");
    deepStrictEqual(asking.asked.newFile, []);
  });

  for (const c of NEW_FILE_QUESTIONS) {
    it(`asks whether the file is new only for file_write with a string path under a rewrite rule: ${c.name}`, async () => {
      // Arrange
      const asking = probes();

      // Act
      await judgeToolCall(c.guard(), c.call, EDITS_ACT, asking);

      // Assert
      deepStrictEqual(asking.asked.newFile, c.asked);
    });
  }
});

describe("judgeToolCall — the shared memory", () => {
  for (const c of UNREADABLE_MEMORY_WRITES) {
    it(`denies in a dev step what the gate cannot read - ${c.name} - before any hook`, async () => {
      // Arrange
      const asking = probes({ memoryDir: ".orkeon/memory" });

      // Act
      const judgement = await judgeToolCall(planGuard([PRE]), c.call, BYPASS_ACT, asking);

      // Assert
      assertRefusedWith(judgement, "dev-plan: refused by the shared memory's guard:");
      deepStrictEqual(asking.asked.hooks, []);
    });
  }

  it("lets a dev step read the shared memory", async () => {
    // Arrange
    const asking = probes({ memoryDir: ".orkeon/memory" });

    // Act
    const { verdict } = await judgeToolCall(planGuard([PRE]), { name: "file_read", input: { path: `${WORKSPACE}/.orkeon/memory/entries/x.md` } }, BYPASS_ACT, asking);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("refuses a write into the shared memory before asking whether the file is new or running a hook", async () => {
    // Arrange
    const asking = probes({ memoryDir: ".orkeon/memory", newFile: true });

    // Act
    const judgement = await judgeToolCall(implementerGuard([PRE]), { name: "file_write", input: { path: ".orkeon/memory/entries/x.md", content: "x" } }, EDITS_ACT, asking);

    // Assert
    assertRefusedWith(judgement, "dev-implement: refused by the shared memory's guard:");
    deepStrictEqual([asking.asked.newFile, asking.asked.hooks], [[], []]);
  });
});

describe("memoryDenyText", () => {
  it("says why the shared memory's guard refused, then which tools write the memory", () => {
    // Arrange
    const why = "x";

    // Act
    const text = memoryDenyText(why);

    // Assert
    strictEqual(text, MEMORY_DENY_X);
  });
});
