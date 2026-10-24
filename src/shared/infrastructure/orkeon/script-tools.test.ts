// The script tools over a recording builder: each declares the access of SCRIPT_TOOLS, a
// schema whose keys are the arguments a rule may name, refuses until its slot is bound,
// and never throws to the model. Run:
//   node --test src/shared/infrastructure/orkeon/script-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";

import { SCRIPT_TOOLS, TOOL_ARGUMENTS } from "../../domain/agent-policy/permission.ts";
import type { WrappedTools } from "../../application/dev/wrapped-tools.ts";
import {
  RUN_BUILD, RUN_TESTS, RUN_VALIDATION, runBuildTool, runTestsTool, runValidationTool, scriptTool, scriptToolSlot,
} from "./script-tools.ts";
import type { ToolBuilderFactory, ValidationCalls } from "./script-tools.ts";

interface Built { name?: string; description?: string; schema?: JsonSchema; access?: string; fn?: (input: unknown) => unknown }

/** A builder that records what it is told, and builds a tool whose execute calls the body. */
function recorder(): { builder: ToolBuilderFactory; built: Built[] } {
  const built: Built[] = [];
  const builder = () => {
    const b: Built = {};
    built.push(b);
    const api: any = {
      name: (v: string) => { b.name = v; return api; },
      description: (v: string) => { b.description = v; return api; },
      withSchema: (v: JsonSchema) => { b.schema = v; return api; },
      access: (v: string) => { b.access = v; return api; },
      execute: (fn: (input: unknown) => unknown) => { b.fn = fn; return api; },
      build: () => ({ name: b.name, description: b.description, execute: (input: unknown) => b.fn!(input) }),
    };
    return api as ToolBuilder<unknown, unknown>;
  };
  return { builder, built };
}

describe("scriptTool", () => {
  it("declares the access SCRIPT_TOOLS gives, and a schema of the arguments a rule may name", () => {
    for (const spec of [RUN_VALIDATION, RUN_TESTS, RUN_BUILD]) {
      const r = recorder();
      scriptTool(r.builder, spec, async () => null);
      strictEqual(r.built[0].access, SCRIPT_TOOLS.find((t) => t.name === spec.name)?.access, spec.name);
      deepStrictEqual(Object.keys((spec.schema as unknown as { properties: object }).properties), [...TOOL_ARGUMENTS[spec.name]]);
    }
  });

  it("refuses to build a tool SCRIPT_TOOLS does not list", () => {
    throws(() => scriptTool(recorder().builder, { name: "run_anything", description: "", schema: { type: "object" } }, async () => null));
  });

  it("hands a throw back as the tool's refusal", async () => {
    const tool = scriptTool(recorder().builder, RUN_TESTS, async () => { throw new Error("boom\nstack"); });
    deepStrictEqual(await tool.execute({}), { ok: false, refused: "run_tests failed: boom" });
  });
});

describe("the tools and their slots", () => {
  it("run_validation refuses until bound, then runs the command through the runner", async () => {
    const slot = scriptToolSlot<ValidationCalls>();
    const tool = runValidationTool(recorder().builder, slot);
    const notReady = {
      ok: false,
      refused: "run_validation is not set up for this run (not bound yet, or two runs at once): name the command in your answer instead",
    };
    deepStrictEqual(await tool.execute({ command: "x" }), notReady);
    const seen: string[] = [];
    const release = slot.bind({
      async run(command) {
        seen.push(command);
        return { report: { command, outcome: "exit 0", tail: "ok" }, line: `\`${command}\` — exit 0` };
      },
    });
    deepStrictEqual(await tool.execute({ command: "dotnet test x" }), { ok: true, command: "dotnet test x", outcome: "exit 0", tail: "ok" });
    deepStrictEqual(await tool.execute({}), { ok: false, refused: "'command' is required" });
    deepStrictEqual(seen, ["dotnet test x"]);
    release();
    deepStrictEqual(await tool.execute({ command: "x" }), notReady);
  });

  it("a slot bound by two runs at once refuses until one releases it", () => {
    const slot = scriptToolSlot<string>();
    const first = slot.bind("a");
    strictEqual(slot.get(), "a");
    const second = slot.bind("b");
    strictEqual(slot.get(), undefined);
    first();
    strictEqual(slot.get(), "b");
    first();
    strictEqual(slot.get(), "b");
    second();
    strictEqual(slot.get(), undefined);
  });

  it("run_tests and run_build call the wrapped tools bound in their slot", async () => {
    const slot = scriptToolSlot<WrappedTools>();
    const calls: string[] = [];
    const tests = runTestsTool(recorder().builder, slot);
    const build = runBuildTool(recorder().builder, slot);
    strictEqual(((await build.execute({})) as { ok: boolean }).ok, false);
    slot.bind({
      async runTests(input) { calls.push(`tests ${JSON.stringify(input)}`); return { ok: false, refused: "t" }; },
      async runBuild(input) { calls.push(`build ${JSON.stringify(input)}`); return { ok: false, refused: "b" }; },
    });
    await tests.execute({ command: "c" });
    await build.execute({ project: "p" });
    deepStrictEqual(calls, ['tests {"command":"c"}', 'build {"project":"p"}']);
  });

  it("under a working root, hand the model root paths and the body /workspace paths (outbound)", async () => {
    const ROOT = "/workspace/.orkeon/worktrees/prune-F2";
    const slot = scriptToolSlot<WrappedTools>();
    const vslot = scriptToolSlot<ValidationCalls>();
    const seen: unknown[] = [];
    slot.bind({
      async runTests(input) { seen.push(input); return { ok: false, exitCode: 1, tail: "/workspace/tests/a.test.ts failed", log: "/workspace/workbench/prune/logs/t.log" } as any; },
      async runBuild() { return { ok: true, log: "/workspace/workbench/prune/logs/b.log" } as any; },
    });
    vslot.bind({ async run(command) { return { report: { command, outcome: "exit 1", tail: "at /workspace/src/a.ts:3" }, line: null }; } });
    const tests = await runTestsTool(recorder().builder, slot, ROOT).execute({ command: `npm test -- ${ROOT}/tests/a.test.ts` });
    const build = await runBuildTool(recorder().builder, slot, ROOT).execute({});
    const validation = await runValidationTool(recorder().builder, vslot, ROOT).execute({ command: "npm test -- tests/a.test.ts" });
    deepStrictEqual(seen, [{ command: "npm test -- /workspace/tests/a.test.ts" }]);
    const shown = JSON.stringify([tests, build, validation]);
    strictEqual(/\/workspace\/(?!\.orkeon\/worktrees\/prune-F2)/.test(shown), false, shown);
    strictEqual((tests as any).log, `${ROOT}/workbench/prune/logs/t.log`);
  });
});
