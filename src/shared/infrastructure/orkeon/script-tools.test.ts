// The script tools over a recording builder: each declares the access of SCRIPT_TOOLS, a
// schema whose keys are the arguments a rule may name, refuses until its slot is bound,
// and never throws to the model. Run:
//   node --test src/shared/infrastructure/orkeon/script-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";

import { SCRIPT_TOOLS, TOOL_ARGUMENTS } from "../../domain/agent-policy/permission.ts";
import type { WrappedTools } from "../../application/dev/wrapped-tools.ts";
import { RUN_TESTS, runBuildTool, runTestsTool, runValidationTool, scriptTool, scriptToolSlot } from "./script-tools.ts";
import type { ValidationCalls } from "./script-tools.ts";
import {
  NOT_READY, ROOT, SPECS, recordingRunner, recordingWrappedTools, rootedSlots,
} from "./script-tools.fixtures.ts";
import { recorder } from "../../../../tests/support/fixtures/tool-recorder.ts";
import { assertRootPathsOnly } from "./script-tools.assertions.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("scriptTool", () => {
  for (const spec of SPECS) {
    it(`declares the access SCRIPT_TOOLS gives ${spec.name}, and a schema of the arguments a rule may name`, () => {
      // Arrange
      const r = recorder();

      // Act
      scriptTool(r.builder, spec, async () => null);

      // Assert
      strictEqual(r.built[0].access, SCRIPT_TOOLS.find((t) => t.name === spec.name)?.access, spec.name);
      deepStrictEqual(Object.keys((spec.schema as unknown as { properties: object }).properties), [...TOOL_ARGUMENTS[spec.name]]);
    });
  }

  it("refuses to build a tool SCRIPT_TOOLS does not list", () => {
    // Arrange
    const spec = { name: "run_anything", description: "", schema: { type: "object" } };

    // Act
    const act = () => scriptTool(recorder().builder, spec, async () => null);

    // Assert
    throws(act);
  });

  it("hands a throw back as the tool's refusal", async () => {
    // Arrange
    const tool = scriptTool(recorder().builder, RUN_TESTS, async () => { throw new Error("boom\nstack"); });

    // Act
    const result = await tool.execute({});

    // Assert
    deepStrictEqual(result, { ok: false, refused: "run_tests failed: boom" });
  });
});

describe("the tools and their slots", () => {
  it("run_validation refuses until bound", async () => {
    // Arrange
    const tool = runValidationTool(recorder().builder, scriptToolSlot<ValidationCalls>());

    // Act
    const result = await tool.execute({ command: "x" });

    // Assert
    deepStrictEqual(result, NOT_READY);
  });

  it("run_validation, once bound, runs the command through the runner", async () => {
    // Arrange
    const slot = scriptToolSlot<ValidationCalls>();
    const tool = runValidationTool(recorder().builder, slot);
    const { runner, seen } = recordingRunner();
    slot.bind(runner);

    // Act
    const result = await tool.execute({ command: "dotnet test x" });

    // Assert
    deepStrictEqual(result, { ok: true, command: "dotnet test x", outcome: "exit 0", tail: "ok" });
    deepStrictEqual(seen, ["dotnet test x"]);
  });

  it("run_validation, once bound, refuses a call without a command and runs nothing", async () => {
    // Arrange
    const slot = scriptToolSlot<ValidationCalls>();
    const tool = runValidationTool(recorder().builder, slot);
    const { runner, seen } = recordingRunner();
    slot.bind(runner);

    // Act
    const result = await tool.execute({});

    // Assert
    deepStrictEqual(result, { ok: false, refused: "'command' is required" });
    deepStrictEqual(seen, []);
  });

  it("run_validation refuses again once its slot is released", async () => {
    // Arrange
    const slot = scriptToolSlot<ValidationCalls>();
    const tool = runValidationTool(recorder().builder, slot);
    const release = slot.bind(recordingRunner().runner);
    release();

    // Act
    const result = await tool.execute({ command: "x" });

    // Assert
    deepStrictEqual(result, NOT_READY);
  });

  it("a slot bound by one run hands its binding", () => {
    // Arrange
    const slot = scriptToolSlot<string>();
    slot.bind("a");

    // Act
    const bound = slot.get();

    // Assert
    strictEqual(bound, "a");
  });

  it("a slot bound by two runs at once refuses", () => {
    // Arrange
    const slot = scriptToolSlot<string>();
    slot.bind("a");
    slot.bind("b");

    // Act
    const bound = slot.get();

    // Assert
    strictEqual(bound, undefined);
  });

  it("a slot bound by two runs at once hands the other binding once one releases it", () => {
    // Arrange
    const slot = scriptToolSlot<string>();
    const first = slot.bind("a");
    slot.bind("b");
    first();

    // Act
    const bound = slot.get();

    // Assert
    strictEqual(bound, "b");
  });

  it("a release called twice leaves the other run's binding", () => {
    // Arrange
    const slot = scriptToolSlot<string>();
    const first = slot.bind("a");
    slot.bind("b");
    first();
    first();

    // Act
    const bound = slot.get();

    // Assert
    strictEqual(bound, "b");
  });

  it("a slot both runs released is unbound", () => {
    // Arrange
    const slot = scriptToolSlot<string>();
    const first = slot.bind("a");
    const second = slot.bind("b");
    first();
    first();
    second();

    // Act
    const bound = slot.get();

    // Assert
    strictEqual(bound, undefined);
  });

  it("run_build refuses until bound", async () => {
    // Arrange
    const build = runBuildTool(recorder().builder, scriptToolSlot<WrappedTools>());

    // Act
    const result = await build.execute({});

    // Assert
    strictEqual((result as { ok: boolean }).ok, false);
  });

  it("run_tests calls the wrapped tools bound in its slot", async () => {
    // Arrange
    const slot = scriptToolSlot<WrappedTools>();
    const tests = runTestsTool(recorder().builder, slot);
    const { wrapped, calls } = recordingWrappedTools();
    slot.bind(wrapped);

    // Act
    await tests.execute({ command: "c" });

    // Assert
    deepStrictEqual(calls, ['tests {"command":"c"}']);
  });

  it("run_build calls the wrapped tools bound in its slot", async () => {
    // Arrange
    const slot = scriptToolSlot<WrappedTools>();
    const build = runBuildTool(recorder().builder, slot);
    const { wrapped, calls } = recordingWrappedTools();
    slot.bind(wrapped);

    // Act
    await build.execute({ project: "p" });

    // Assert
    deepStrictEqual(calls, ['build {"project":"p"}']);
  });

  it(`run_tests under a working root hands the body ${WORKSPACE} paths and the model root paths (outbound)`, async () => {
    // Arrange
    const { slot, seen } = rootedSlots();

    // Act
    const tests = await runTestsTool(recorder().builder, slot, ROOT).execute({ command: `npm test -- ${ROOT}/tests/a.test.ts` });

    // Assert
    deepStrictEqual(seen, [{ command: `npm test -- ${WORKSPACE}/tests/a.test.ts` }]);
    assertRootPathsOnly(tests);
    strictEqual((tests as any).log, `${ROOT}/workbench/prune/logs/t.log`);
  });

  it("run_build under a working root hands the model root paths (outbound)", async () => {
    // Arrange
    const { slot } = rootedSlots();

    // Act
    const build = await runBuildTool(recorder().builder, slot, ROOT).execute({});

    // Assert
    assertRootPathsOnly(build);
  });

  it("run_validation under a working root hands the model root paths (outbound)", async () => {
    // Arrange
    const { vslot } = rootedSlots();

    // Act
    const validation = await runValidationTool(recorder().builder, vslot, ROOT).execute({ command: "npm test -- tests/a.test.ts" });

    // Assert
    assertRootPathsOnly(validation);
  });
});
