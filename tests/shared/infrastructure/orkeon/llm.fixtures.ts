// The schema, the act results, the requests and the facades the createLlm tests run on.
import { createLlm } from "../../../../src/shared/infrastructure/orkeon/llm.ts";
import type { ActCallbacks, ToolCallbacks } from "../../../../src/shared/application/dev/tool-callbacks.ts";
import type { HostSource } from "../../../../src/shared/application/host-context.ts";
import type { EffortLevel } from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";
import { FakeLlmFacade } from "../../../support/doubles/fake-llm-facade.ts";
import { PROJECT_WIN } from "../../../support/fixtures/host-context.ts";

export const SCHEMA = { type: "object", properties: { findings: { type: "array" } } };

/**
 * An Llm over a facade whose host says its gate is off, with tool callbacks recording the mode and the gate state
 * each act built them for.
 */
export function llmWithCallbacks(host?: HostSource) {
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
  return { facade, asked, onToolCall, onToolResult, llm: createLlm(facade, callbacks, host === undefined ? {} : { host }) };
}

/** The callbacks of the first act the facade received. */
export function actCallbacksOf(facade: FakeLlmFacade): ActCallbacks {
  return facade.calls[0].args[1] as ActCallbacks;
}

/** A file_read spelled as the Windows disk does, and its VFS call. */
export const DISK_READ = { name: "file_read", input: { path: `${PROJECT_WIN}\\src\\a.ts` } };
export const VIRTUAL_READ = { name: "file_read", input: { path: "/workspace/src/a.ts" } };

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
  {
    name: "passes the request's profile as the llm patch",
    request: { system: "SYS", maxIterations: 12, profile: "small" },
    options: { system: "SYS", maxIterations: 12, llm: { profile: "small" } },
  },
  {
    name: "passes a profile and a model together, the model chosen within the profile",
    request: { system: "SYS", maxIterations: 12, profile: "small", model: "gpt-x" },
    options: { system: "SYS", maxIterations: 12, llm: { profile: "small", model: "gpt-x" } },
  },
  {
    name: "passes no llm patch for an empty profile",
    request: { system: "SYS", maxIterations: 12, profile: "" },
    options: { system: "SYS", maxIterations: 12 },
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
  options?: { model?: string; profile?: string };
  /** The arguments the facade's complete receives. */
  args: unknown[];
}

/** Completions, the model override as the llm patch, or no options. */
export const COMPLETIONS: readonly CompleteCase[] = [
  { name: "completes with the model override as the llm patch", prompt: "a", options: { model: "gpt-big" }, args: ["a", { llm: { model: "gpt-big" } }] },
  { name: "completes on the profile the override names", prompt: "d", options: { profile: "small" }, args: ["d", { llm: { profile: "small" } }] },
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
  defaults?: { effort: EffortLevel };
  request: { effort?: EffortLevel };
  expected: EffortLevel | undefined;
}

/** The act's effort, from the crew's defaults or the request (A-3). */
export const EFFORTS: readonly EffortCase[] = [
  { name: "fills the act's effort from the defaults when the request names none", defaults: { effort: "low" }, request: {}, expected: "low" },
  { name: "keeps the effort the request names over the defaults", defaults: { effort: "low" }, request: { effort: "high" }, expected: "high" },
  { name: "forwards a level above high as the request names it", request: { effort: "xhigh" }, expected: "xhigh" },
  { name: "names no effort without defaults nor request", request: {}, expected: undefined },
];

export interface EffortSentCase {
  name: string;
  defaults?: { effort?: EffortLevel };
  request: { effort?: EffortLevel; model?: string; profile?: string };
  /** What the facade's reasoning() answers; an Error is thrown. */
  answer: unknown;
  /** The options reasoning() received; none when it was not asked. */
  asked: unknown[];
  expected: unknown;
}

const LOWERED = { model: "glm-5.3", asked: "medium", sent: "low", notice: "lowered" };
/** What the host's own `Llm:Thinking:Effort` sends, reported with no effort asked. */
const HOST_HIGH = { model: "glm-5.3", asked: "high", sent: "high", notice: null };

/** What an act sends for its effort, asked of the facade without a call (Orkeon #360). */
export const EFFORTS_SENT: readonly EffortSentCase[] = [
  { name: "asks the facade with the request's effort", request: { effort: "medium" }, answer: LOWERED, asked: [{ effort: "medium" }], expected: LOWERED },
  {
    name: "asks with the crew's effort when the request names none, and with the request's model",
    defaults: { effort: "medium" }, request: { model: "glm-5.3" }, answer: LOWERED,
    asked: [{ effort: "medium", llm: { model: "glm-5.3" } }], expected: LOWERED,
  },
  {
    name: "keeps the request's effort over the crew's",
    defaults: { effort: "low" }, request: { effort: "medium" }, answer: LOWERED, asked: [{ effort: "medium" }], expected: LOWERED,
  },
  {
    name: "asks with no effort when neither names one, and answers what the host's own configuration sends",
    request: {}, answer: HOST_HIGH, asked: [{}], expected: HOST_HIGH,
  },
  { name: "answers nothing when neither names an effort and the host asks for none", request: {}, answer: null, asked: [{}], expected: null },
  { name: "answers nothing when the facade cannot tell", request: { effort: "high" }, answer: null, asked: [{ effort: "high" }], expected: null },
  {
    name: "answers nothing when the facade throws on the profile",
    request: { effort: "high", profile: "ghost" }, answer: new Error("unknown LLM profile 'ghost'"),
    asked: [{ effort: "high", llm: { profile: "ghost" } }], expected: null,
  },
];

export interface ContextCase {
  name: string;
  context: string;
  /** The prompt and options the facade's act receives. */
  args: unknown[];
}

/** A request's context: act's own option (Orkeon #277), left out when blank. */
export const CONTEXT_CASES: readonly ContextCase[] = [
  { name: "passes the context as act's own option", context: "CTX", args: ["p", { context: "CTX" }] },
  { name: "sends no context option for a blank context", context: "  ", args: ["p", {}] },
];
