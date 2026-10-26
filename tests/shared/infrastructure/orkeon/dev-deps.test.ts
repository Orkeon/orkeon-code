// The dev crews' ports built from the calling agent's own tools, never the runtime's globals: the globals throw
// here, set before the module is loaded, and every call lands in the body's FakeTools. Under a working root the
// briefs leave as root paths. Run:
//   node --test src/shared/infrastructure/orkeon/dev-deps.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  AUDITOR_TOOLS, LAYOUT, QUOTING_BRIEF, QUOTING_BRIEF_ROOTED, ROOT, ROOTED_WRITE, context,
  loadDevDeps, rootedImplementerCallbacks, toolNames, twoBatchParts, validationTool,
} from "./dev-deps.fixtures.ts";
import { assertAskedNames, assertRootPathsOnly } from "./dev-deps.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { recorder } from "../../../support/fixtures/tool-recorder.ts";

describe("implementDeps and verifyDeps", () => {
  it("implementDeps reads files through the body's tools", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, toolSlot: undefined });

    // Act
    await deps.files.read(`${WORKSPACE}/a.ts`);

    // Assert
    ok(tools.calls.some((c) => c.tool === "fileRead"), JSON.stringify(tools.calls));
  });

  it("implementDeps runs the shell through the body's tools", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, toolSlot: undefined });

    // Act
    await deps.shell.run("git status");

    // Assert
    ok(tools.calls.some((c) => c.tool === "shellCommand"), JSON.stringify(tools.calls));
  });

  it("implementDeps reads the config through the body's tools", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, toolSlot: undefined });

    // Act
    await deps.config.readValue("memory.dir").catch(() => undefined);

    // Assert
    ok(tools.calls.length > 0, "the config read reached none of the body's tools");
  });

  it("verifyDeps reads files through the body's tools", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, validationSlot: undefined });

    // Act
    await verify.files.read(`${WORKSPACE}/b.ts`);

    // Assert
    strictEqual(tools.inputsOf("fileRead").length >= 1, true);
  });

  it("without a root, implementDeps gives the cost index", async () => {
    // Arrange
    const m = await loadDevDeps();
    const plain = context();

    // Act
    const deps = m.implementDeps(plain.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined });

    // Assert
    ok(deps.costIndex !== undefined);
  });

  it(`without a root, implementDeps names ${WORKSPACE} as today`, async () => {
    // Arrange
    const m = await loadDevDeps();
    const plain = context();
    const deps = m.implementDeps(plain.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined });

    // Act
    await deps.files.read(`${WORKSPACE}/src/a.ts`);

    // Assert
    strictEqual((plain.tools.inputsOf("fileRead")[0] as { path: string }).path, `${WORKSPACE}/src/a.ts`);
  });

  it("under a root, implementDeps gives no cost index", async () => {
    // Arrange
    const m = await loadDevDeps();
    const rooted = context();

    // Act
    const batch = m.implementDeps(rooted.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });

    // Assert
    strictEqual(batch.costIndex, undefined);
  });

  it("under a root, implementDeps names the root's paths", async () => {
    // Arrange
    const m = await loadDevDeps();
    const rooted = context();
    const batch = m.implementDeps(rooted.ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });

    // Act
    await batch.files.read(`${WORKSPACE}/src/a.ts`);

    // Assert
    strictEqual((rooted.tools.inputsOf("fileRead")[0] as { path: string }).path, `${ROOT}/src/a.ts`);
  });

  it("send a batch's role act its brief and system text with the root's paths", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });

    // Act
    await deps.roleLlm("implementer", LAYOUT, () => undefined, []).act(
      `Turn green the tests of ${WORKSPACE}/tests/a.test.ts; the sheet is ${WORKSPACE}/todo/prune/PRUNE-PLAN-F2.md`, { system: `Work in ${WORKSPACE}.` },
    );

    // Assert
    assertRootPathsOnly(asked);
    assertAskedNames(asked, `${ROOT}/todo/prune/PRUNE-PLAN-F2.md`);
  });

  it("send a batch's audit act its brief and system text with the root's paths", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, root: ROOT });

    // Act
    await verify.llm.act(`Audit ${WORKSPACE}/todo/prune/capture-F2/ and run_validation`, { system: `The checkout is ${WORKSPACE}` });

    // Assert
    assertRootPathsOnly(asked);
    assertAskedNames(asked, `${ROOT}/todo/prune/capture-F2/`);
  });

  it("send a batch's extract its prompt with the root's paths", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, root: ROOT });

    // Act
    await verify.llm.extract(`Rows of ${WORKSPACE}/todo/prune/PRUNE-VERIFY-F2.md`, {});

    // Assert
    assertRootPathsOnly(asked);
  });

  it(`keep what a batch's brief quotes of the files: a quoted ${WORKSPACE} constant, a fenced diff`, async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const deps = m.implementDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, toolSlot: undefined, root: ROOT });

    // Act
    await deps.roleLlm("implementer", LAYOUT, () => undefined, []).act(QUOTING_BRIEF, {});

    // Assert
    strictEqual(asked[0].prompt, QUOTING_BRIEF_ROOTED);
  });

  it("hand the act's callbacks a call under the root, which they allow", async () => {
    // Arrange
    const { callbacks } = await rootedImplementerCallbacks();

    // Act
    const verdict = await callbacks.onToolCall(ROOTED_WRITE);

    // Assert
    strictEqual(verdict, "allow");
  });

  it("hand the act's callbacks the logical path of a call under the root", async () => {
    // Arrange
    const { callbacks, wrote } = await rootedImplementerCallbacks();
    await callbacks.onToolCall(ROOTED_WRITE);

    // Act
    await callbacks.onToolResult(ROOTED_WRITE, { success: true });

    // Assert
    deepStrictEqual(wrote, [`${WORKSPACE}/src/a.ts`]);
  });

  it("verifyDeps offers the audit's act the auditor's tools alone, never the batch agent's write tools", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, validationSlot: undefined, root: ROOT });

    // Act
    await verify.llm.act("Audit F2", {});

    // Assert
    deepStrictEqual(asked.at(-1)!.options?.tools, AUDITOR_TOOLS);
  });

  it("verifyDeps keeps the tools the audit's act names", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, asked } = context();
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: true, validationSlot: undefined, root: ROOT });

    // Act
    await verify.llm.act("Audit F2", { tools: ["file_read"] });

    // Assert
    deepStrictEqual(asked.at(-1)!.options?.tools, ["file_read"]);
  });

  it("verifyDeps wraps the plain Llm when the crew asks (its background auditor), and harvests after GAPS when asked", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx } = context();
    const marker = { act: async () => "child", complete: async () => "", extract: async () => ({}), permissionGateEnabled: () => undefined };

    // Act
    const wrapped = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, wrapLlm: () => marker, harvest: true });

    // Assert
    strictEqual(wrapped.llm, marker);
    strictEqual(typeof wrapped.harvest, "function");
  });

  it("verifyDeps harvests nothing when not asked", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx } = context();

    // Act
    const verify = m.verifyDeps(ctx, { hooks: [], effort: undefined, memoryOn: false, validationSlot: undefined, root: ROOT });

    // Assert
    strictEqual(verify.harvest, undefined);
  });
});

describe("batchAgentParts", () => {
  it("gives each batch agent its own slots: two audits at once each reach their own run_validation runner", async () => {
    // Arrange
    const parts = await twoBatchParts();
    const seen: string[] = [];
    parts.forEach((p, i) => p.validationSlot.bind({
      async run(command) {
        seen.push(`${i === 0 ? "F2" : "F3"} ${command}`);
        return { report: { command, outcome: "exit 0", tail: "" }, line: "" };
      },
    }));

    // Act
    await Promise.all([validationTool(parts[0]).execute({ command: "npm test" }), validationTool(parts[1]).execute({ command: "npm run build" })]);

    // Assert
    deepStrictEqual(seen.sort(), ["F2 npm test", "F3 npm run build"]);
  });

  it("gives each batch agent its own spend", async () => {
    // Arrange
    const parts = await twoBatchParts();

    // Act
    parts[0].spend.take();

    // Assert
    deepStrictEqual([parts[0].spend.calls(), parts[1].spend.calls()], [1, 0]);
  });

  it("gives each batch agent its own tool slot and body tools", async () => {
    // Arrange
    const parts = await twoBatchParts();

    // Act
    const [first, second] = parts;

    // Assert
    ok(first.toolSlot !== second.toolSlot && first.bodyTools !== second.bodyTools);
  });

  it("gives a batch agent the script tools, without memory_recall when memory is off", async () => {
    // Arrange
    const parts = await twoBatchParts();

    // Act
    const names = toolNames(parts[0]);

    // Assert
    deepStrictEqual(names, ["run_tests", "run_build", "run_validation"]);
  });

  it("gives a batch agent memory_recall after the script tools when memory is on", async () => {
    // Arrange
    const m = await loadDevDeps();

    // Act
    const parts = m.batchAgentParts(recorder().builder, { root: "/r", toolCalls: 1, memoryOn: true });

    // Assert
    deepStrictEqual(toolNames(parts), ["run_tests", "run_build", "run_validation", "memory_recall"]);
  });
});

describe("agentTools", () => {
  it("builds memory_recall's ports over the tools its body bound", async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    const holder = m.agentTools();
    holder.bind(ctx.tools);
    const ports = holder.memoryPorts(ROOT)();

    // Act
    await ports.files.read(`${WORKSPACE}/.orkeon/memory/a.md`);

    // Assert
    strictEqual((tools.inputsOf("fileRead")[0] as { path: string }).path, `${ROOT}/.orkeon/memory/a.md`);
  });
});

describe("gitTopUnder", () => {
  it(`runs git under the root and answers its raw top, never mapped back to ${WORKSPACE}`, async () => {
    // Arrange
    const m = await loadDevDeps();
    const { ctx, tools } = context();
    tools.replies.shellCommand = { stdout: `${ROOT}\n`, stderr: "", exit_code: 0, success: true };

    // Act
    const top = await m.gitTopUnder(ctx.tools, ROOT);

    // Assert
    deepStrictEqual(top, { exitCode: 0, top: ROOT });
    deepStrictEqual(tools.inputsOf("shellCommand")[0], { command: "git rev-parse --show-toplevel", working_directory: ROOT });
  });
});
