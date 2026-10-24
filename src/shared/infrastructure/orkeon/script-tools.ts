/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The tools Orkeon Code defines itself, built with the runtime's toolBuilder and attached to an
// agent with `withAutonomousTool` (never named in `.tools([...])`): run_validation for the auditor,
// run_tests and run_build for a writing role. The host gate is asked once per model call, from the
// access each declares (permission.ts SCRIPT_TOOLS: undeclared would be a write); the shell
// commands the body runs are not asked again, so each body runs the guard chain first
// (application/dev/wrapped-tools.ts, dev-verify's audit.ts). A body never throws to the model:
// a throw comes back as `{ok: false, refused}`, the tool's result.
//
// A crew builds its tools before its agent's body runs, and the body is where the pack and the
// step's rules are known: each tool reads what it calls from a slot the body fills (bind), and
// refuses while the slot is empty. A slot belongs to the crew script that built it; the body releases
// it when its run ends. Two runs of one crew bound at once would mix their calls, so the slot then
// refuses until one of them releases it.
//
// Given a batch's working root (a parallel /dev-batches), a tool's input comes back from the root to the logical
// `/workspace` its body names, and its result goes out with each `/workspace` path on the root: the model, held to
// its root, is never handed a path it may not touch (shared/domain/dev/path-rebase.ts).

import { scriptToolAccess } from "../../domain/agent-policy/permission.ts";
import { mapStrings, textFromRoot, textToRoot } from "../../domain/dev/path-rebase.ts";
import type { WrappedRun, WrappedTools } from "../../application/dev/wrapped-tools.ts";
import type { ScriptToolSlot } from "../../application/dev/script-tool-slot.ts";

export { scriptToolSlot } from "../../application/dev/script-tool-slot.ts";
export type { ScriptToolSlot } from "../../application/dev/script-tool-slot.ts";

/** The runtime's `toolBuilder`, or a test's. */
export type ToolBuilderFactory = () => ToolBuilder<unknown, unknown>;

export interface ScriptToolSpec {
  /** One of SCRIPT_TOOLS: its access comes from there. */
  name: string;
  description: string;
  schema: JsonSchema;
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split("\n")[0];

/** The tool `spec` describes, its body `handler`; a throw of the handler is the tool's refusal. Under `root`,
 *  the input is read back on `/workspace` and the result's paths go out on the root. */
export function scriptTool(
  builder: ToolBuilderFactory, spec: ScriptToolSpec, handler: (input: unknown) => Promise<unknown>, root?: string,
): Tool<unknown, unknown> {
  const access = scriptToolAccess(spec.name);
  if (access === undefined) throw new Error(`'${spec.name}' is not one of Orkeon Code's tools (SCRIPT_TOOLS)`);
  return builder()
    .name(spec.name)
    .description(spec.description)
    .withSchema(spec.schema)
    .access(access)
    .execute(async (input: unknown) => {
      try {
        const result = await handler(mapStrings(input, (t) => textFromRoot(t, root)));
        return mapStrings(result, (t) => textToRoot(t, root));
      } catch (error) {
        return { ok: false, refused: `${spec.name} failed: ${firstLine(error)}` };
      }
    })
    .build();
}

const notReady = (name: string) => ({
  ok: false, refused: `${name} is not set up for this run (not bound yet, or two runs at once): name the command in your answer instead`,
});

const commandSchema = (what: string): JsonSchema => ({
  type: "object",
  properties: { command: { type: "string", description: what } },
  required: ["command"],
});

/** What run_validation calls: dev-verify's recording runner (audit.ts), seen by its shape. */
export interface ValidationCalls {
  run(command: string): Promise<{ report: { command: string; outcome: string; tail: string }; line: string | null }>;
}

export const RUN_VALIDATION: ScriptToolSpec = {
  name: "run_validation",
  description:
    "Run one narrow test command of the repository pack (one test class, one test project, or the integration " +
    "tests narrowed by a filter, exactly as the brief lists them, each <placeholder> filled with one plain value) " +
    "and return its exit code and the tail of its output. Three per audit at most; never a whole suite, a build or " +
    "an option of your own.",
  schema: commandSchema("The command, one of the brief's validation commands with its placeholders filled."),
};

export function runValidationTool(builder: ToolBuilderFactory, slot: ScriptToolSlot<ValidationCalls>, root?: string): Tool<unknown, unknown> {
  return scriptTool(builder, RUN_VALIDATION, async (input) => {
    const runner = slot.get();
    if (runner === undefined) return notReady(RUN_VALIDATION.name);
    const command = (input as { command?: unknown } | null)?.command;
    if (typeof command !== "string" || command.trim() === "") return { ok: false, refused: "'command' is required" };
    const { report, line } = await runner.run(command);
    return { ok: line !== null, command: report.command, outcome: report.outcome, tail: report.tail };
  }, root);
}

export const RUN_TESTS: ScriptToolSpec = {
  name: "run_tests",
  description:
    "Run one narrow test command of the repository pack (test_class, test_project, or test_integration with its " +
    "filter), each <placeholder> filled with one plain relative value. Returns the exit code, the tail of the output " +
    "and the path of the whole log. Never a whole suite, never a restore.",
  schema: commandSchema("The pack's test command with its placeholders filled."),
};

export const RUN_BUILD: ScriptToolSpec = {
  name: "run_build",
  description:
    "Build with the repository pack's command: without project, commands.build; with project, commands.build_test " +
    "for that test project. Never restores, except once on a tree that was never restored. Returns the exit code, " +
    "whether it restored, the tail of the output and the path of the whole log.",
  schema: {
    type: "object",
    properties: { project: { type: "string", description: "The test project to build, a plain relative path; absent, the whole build." } },
  },
};

function wrapped(
  builder: ToolBuilderFactory, spec: ScriptToolSpec, slot: ScriptToolSlot<WrappedTools>,
  call: (tools: WrappedTools, input: unknown) => Promise<WrappedRun>, root?: string,
): Tool<unknown, unknown> {
  return scriptTool(builder, spec, async (input) => {
    const tools = slot.get();
    return tools === undefined ? notReady(spec.name) : call(tools, input);
  }, root);
}

export const runTestsTool = (builder: ToolBuilderFactory, slot: ScriptToolSlot<WrappedTools>, root?: string): Tool<unknown, unknown> =>
  wrapped(builder, RUN_TESTS, slot, (tools, input) => tools.runTests(input), root);

export const runBuildTool = (builder: ToolBuilderFactory, slot: ScriptToolSlot<WrappedTools>, root?: string): Tool<unknown, unknown> =>
  wrapped(builder, RUN_BUILD, slot, (tools, input) => tools.runBuild(input), root);
