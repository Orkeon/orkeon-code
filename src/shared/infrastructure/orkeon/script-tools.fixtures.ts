// The recording tool builder, the slots' bindings and the expected refusals the script tools tests use.
import type { WrappedTools } from "../../application/dev/wrapped-tools.ts";
import { RUN_BUILD, RUN_TESTS, RUN_VALIDATION, scriptToolSlot } from "./script-tools.ts";
import type { ToolBuilderFactory, ValidationCalls } from "./script-tools.ts";

export const ROOT = "/workspace/.orkeon/worktrees/prune-F2";

export interface Built { name?: string; description?: string; schema?: JsonSchema; access?: string; fn?: (input: unknown) => unknown }

/** A builder that records what it is told, and builds a tool whose execute calls the body. */
export function recorder(): { builder: ToolBuilderFactory; built: Built[] } {
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

/** The specs of the script tools. */
export const SPECS = [RUN_VALIDATION, RUN_TESTS, RUN_BUILD] as const;

/** What run_validation answers while its slot is unbound. */
export const NOT_READY = {
  ok: false,
  refused: "run_validation is not set up for this run (not bound yet, or two runs at once): name the command in your answer instead",
};

/** A validation runner answering exit 0 with the tail "ok", the commands it ran recorded. */
export function recordingRunner(): { runner: ValidationCalls; seen: string[] } {
  const seen: string[] = [];
  const runner: ValidationCalls = {
    async run(command) {
      seen.push(command);
      return { report: { command, outcome: "exit 0", tail: "ok" }, line: `\`${command}\` — exit 0` };
    },
  };
  return { runner, seen };
}

/** Wrapped tools refusing every call, each call recorded as `tests <input>` or `build <input>`. */
export function recordingWrappedTools(): { wrapped: WrappedTools; calls: string[] } {
  const calls: string[] = [];
  const wrapped: WrappedTools = {
    async runTests(input) { calls.push(`tests ${JSON.stringify(input)}`); return { ok: false, refused: "t" }; },
    async runBuild(input) { calls.push(`build ${JSON.stringify(input)}`); return { ok: false, refused: "b" }; },
  };
  return { wrapped, calls };
}

/**
 * The slots of a run under ROOT: wrapped tools answering /workspace paths, the inputs run_tests received recorded, and
 * a validation runner answering a /workspace path in its tail.
 */
export function rootedSlots() {
  const slot = scriptToolSlot<WrappedTools>();
  const vslot = scriptToolSlot<ValidationCalls>();
  const seen: unknown[] = [];
  slot.bind({
    async runTests(input) { seen.push(input); return { ok: false, exitCode: 1, tail: "/workspace/tests/a.test.ts failed", log: "/workspace/workbench/prune/logs/t.log" } as any; },
    async runBuild() { return { ok: true, log: "/workspace/workbench/prune/logs/b.log" } as any; },
  });
  vslot.bind({ async run(command) { return { report: { command, outcome: "exit 1", tail: "at /workspace/src/a.ts:3" }, line: null }; } });
  return { slot, vslot, seen };
}
