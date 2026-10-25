// The schema, the act results, the requests and the facades the createLlm tests run on.
import { createLlm } from "./llm.ts";
import type { ToolCallbacks } from "./tool-callbacks.ts";
import { FakeLlmFacade } from "../../../../tests/support/fake-llm-facade.ts";

export const SCHEMA = { type: "object", properties: { findings: { type: "array" } } };

/**
 * An Llm over a facade whose host says its gate is off, with tool callbacks recording the mode and the gate state
 * each act built them for.
 */
export function llmWithCallbacks() {
  const facade = Object.assign(new FakeLlmFacade(), { permissionGate: { enabled: false } });
  const asked: Array<[string, boolean | undefined]> = [];
  const onToolCall = async () => "allow" as const;
  const onToolResult = async () => undefined;
  const callbacks = {
    guard: {} as ToolCallbacks["guard"],
    forAct(mode: string, gateEnabled: boolean | undefined) {
      asked.push([mode, gateEnabled]);
      return { onToolCall, onToolResult };
    },
  };
  return { facade, asked, onToolCall, onToolResult, llm: createLlm(facade, callbacks) };
}

export interface AnswerCase {
  name: string;
  result: unknown;
  expected: string;
}

/** What act answers for each result the facade hands back. */
export const ACT_ANSWERS: readonly AnswerCase[] = [
  { name: "answers the result's output", result: { output: "done", iterations: 3 }, expected: "done" },
  { name: "answers a bare string result as is", result: "bare answer", expected: "bare answer" },
  { name: "answers a null result as empty", result: null, expected: "" },
  { name: "answers an undefined result as empty", result: undefined, expected: "" },
  { name: "keeps an empty output", result: { output: "", iterations: 1 }, expected: "" },
  { name: "stringifies a result whose output is missing", result: { iterations: 1 }, expected: "[object Object]" },
  { name: "stringifies a result whose output is null", result: { output: null }, expected: "[object Object]" },
];

export interface RequestCase {
  name: string;
  request: Record<string, unknown>;
  /** The options the facade's act receives. */
  options: unknown;
}

/** Requests passed through, their model as the llm patch. */
export const REQUESTS: readonly RequestCase[] = [
  {
    name: "passes the request through, its model as the llm patch",
    request: { maxIterations: 80, permissionMode: "plan", system: "SYS", model: "gpt-x" },
    options: { maxIterations: 80, permissionMode: "plan", system: "SYS", llm: { model: "gpt-x" } },
  },
  { name: "passes a request without a model as it is", request: { system: "SYS", maxIterations: 1 }, options: { system: "SYS", maxIterations: 1 } },
  {
    name: "passes no llm patch for an empty model",
    request: { maxIterations: 20, permissionMode: "default", system: "SYS", model: "" },
    options: { maxIterations: 20, permissionMode: "default", system: "SYS" },
  },
];

export interface MarkerCase {
  name: string;
  result: unknown;
  expected: Record<string, unknown>;
}

/** The host's failure markers, in an output or as a bare string: thrown as an LlmFailure, never answered. */
export const ACT_FAILURE_MARKERS: readonly MarkerCase[] = [
  {
    name: "throws the host's failure marker in an output as an LlmFailure, never answers it",
    result: { output: "<undefined-llm:503 Service Unavailable>", iterations: 1 },
    expected: { name: "LlmFailure", message: "the model call failed: 503 Service Unavailable", detail: "503 Service Unavailable" },
  },
  {
    name: "throws the host's failure marker as a bare string as an LlmFailure, never answers it",
    result: "<undefined-llm:act:p>",
    expected: { name: "LlmFailure", detail: "act:p" },
  },
];

export interface CompleteCase {
  name: string;
  prompt: string;
  options?: { model?: string };
  /** The arguments the facade's complete receives. */
  args: unknown[];
}

/** Completions, the model override as the llm patch, or no options. */
export const COMPLETIONS: readonly CompleteCase[] = [
  { name: "completes with the model override as the llm patch", prompt: "a", options: { model: "gpt-big" }, args: ["a", { llm: { model: "gpt-big" } }] },
  { name: "completes with no options when none is given", prompt: "b", args: ["b", undefined] },
  { name: "completes with no options for an empty model", prompt: "c", options: { model: "" }, args: ["c", undefined] },
];

export interface GateCase {
  name: string;
  facade: () => FakeLlmFacade;
  expected: boolean | undefined;
}

/** The host's gate state, as each runtime exposes it or not. */
export const GATES: readonly GateCase[] = [
  { name: "reads undefined on a runtime that does not expose the gate", facade: () => new FakeLlmFacade(), expected: undefined },
  { name: "reads the host's gate off", facade: () => Object.assign(new FakeLlmFacade(), { permissionGate: { enabled: false } }), expected: false },
  { name: "reads the host's gate on", facade: () => Object.assign(new FakeLlmFacade(), { permissionGate: { enabled: true } }), expected: true },
];

export interface EffortCase {
  name: string;
  defaults?: { effort: "low" };
  request: { effort?: "high" };
  expected: string | undefined;
}

/** The act's effort, from the crew's defaults or the request (A-3). */
export const EFFORTS: readonly EffortCase[] = [
  { name: "fills the act's effort from the defaults when the request names none", defaults: { effort: "low" }, request: {}, expected: "low" },
  { name: "keeps the effort the request names over the defaults", defaults: { effort: "low" }, request: { effort: "high" }, expected: "high" },
  { name: "names no effort without defaults nor request", request: {}, expected: undefined },
];
