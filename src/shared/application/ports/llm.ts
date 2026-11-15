// The model port: the agentic call, the completion and the extraction, with their per-call settings.
// Types only, re-exported by ../ports.ts.
import type { EffortLevel } from "../../domain/agent-policy/behavior-flags.ts";
import type { EffortReport, ReasoningCapabilities, ReasoningTarget } from "../../domain/agent-policy/reasoning.ts";
import type { ContextPressure, PressureSettings, PruneVerdict } from "../../domain/context-prune.ts";

/** What one model call may change, for that call only. */
export interface ModelOverride {
  /** The model to answer with; the host's provider keeps its credentials and
   *  endpoint. Empty or absent: the model the host booted with. */
  model?: string;
  /** The host profile (`Llm:Profiles:<name>`, or a decision profile) this one call runs on, `model` then choosing
   *  the model within it. Empty or absent: the agent's own profile. A name the host does not declare throws. */
  profile?: string;
}

/** The settings of one completion. */
export interface CompleteRequest extends ModelOverride {
  /** The system message the completion starts with, the prompt then being the user
   *  message: a crew's instructions at system authority, its material (a diff, a
   *  transcript, an answer under review) as the user's. Absent: the prompt alone. */
  system?: string;
}

/** The settings of one agentic call. */
export interface ActRequest extends ModelOverride {
  /** The system message the conversation starts with. */
  system?: string;
  /** The context of the call (memory, repository state, earlier turns): a user message of its own, after `system`
   *  and before the prompt, so the prompt stays the last user message, the request a decision profile judges
   *  (Orkeon #276). Absent or blank: no message. */
  context?: string;
  /** Tool-call iterations granted; the runtime's default when absent. */
  maxIterations?: number;
  /** The mode the host's permission gate applies to each tool call. */
  permissionMode?: string;
  /** The provider's thinking at this level (`act({effort})`); none when absent. A level the provider or the model
   *  does not take is sent as another one (the highest it takes below, else the lowest it takes) or dropped by the
   *  runtime, with a warning in its log: `Llm.effortSent` says which. */
  effort?: EffortLevel;
  /** The agent's tools offered for this call (a role's subset); all of them when absent. */
  tools?: readonly string[];
  /** Asked by the runtime before a model turn once the loop's messages pass `contextPressure.thresholdTokens`
   *  (Orkeon #327): the older results of the read tools that ran, answered by call id. A call left out keeps its
   *  result; a callback that throws prunes nothing. Absent: nothing is pruned. */
  onContextPressure?: (pressure: ContextPressure) => Promise<Record<string, PruneVerdict> | void>;
  /** When `onContextPressure` runs and what a `head` verdict keeps; the runtime's defaults when absent. */
  contextPressure?: PressureSettings;
}

/** The model, as the crews call it. Every call throws when the host's provider
 *  fails; a failed `act` or `complete` throws an LlmFailure (shared/domain/llm-failure.ts), and a call a
 *  decision stage of the host blocked rejects with the runtime's DecisionBlockedError (decisionBlockOf). */
export interface Llm {
  /** The model ⇄ tool-call loop over the running agent's tools, under the crew's
   *  budget; resolves to the final answer's text. A token budget that ran out
   *  rejects with a BudgetExhaustedAnswer (shared/domain/llm-failure.ts) carrying
   *  the wrap-up the model made without tools: never resolved as an answer. */
  act(prompt: string, request: ActRequest): Promise<string>;
  /** One completion, without tools; with `request.system`, a system message first. */
  complete(prompt: string, request?: CompleteRequest): Promise<string>;
  /** A JSON answer shaped by `schema`; throws when the reply does not parse. */
  extract(prompt: string, schema: object): Promise<unknown>;
  /** Whether the host's permission gate checks the tool calls of `act`: false, the mode and the
   *  session's rules check nothing; undefined when the facade does not say (a test's). */
  permissionGateEnabled(): boolean | undefined;
  /** What an act with this request sends for its effort (Orkeon #360), judged on the running agent's provider and
   *  model, the request's profile and model over them; places no call. A request and a crew that ask for no effort
   *  give what the host's own configuration sends. Null when nothing asks for an effort, or the host cannot tell.
   *  Null too for a request naming a profile the host does not declare: its act is the one that fails. */
  effortSent(request: Pick<ActRequest, "effort" | "model" | "profile">): EffortReport | null;
}

/** What the host's models take for reasoning, read by a command before any call (Orkeon #359, #360): the runtime's
 *  own judgement, the host's `Llm:ModelCapabilities` included. Both answer null when the host cannot tell (no `llm`
 *  namespace, no provider), and for a target on a profile the host does not declare (Orkeon #364). */
export interface ReasoningReader {
  /** What the model of `target` takes. */
  capabilities(target: ReasoningTarget): ReasoningCapabilities | null;
  /** What a call on `target` asking for `level` sends; with no level, what the host's own configuration sends
   *  (`Llm:Thinking:Effort`), null when it asks for none. */
  effort(target: ReasoningTarget, level: EffortLevel | null): EffortReport | null;
}
