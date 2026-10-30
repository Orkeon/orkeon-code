// The model port: the agentic call, the completion and the extraction, with their per-call settings.
// Types only, re-exported by ../ports.ts.

/** What one model call may change, for that call only. */
export interface ModelOverride {
  /** The model to answer with; the host's provider keeps its credentials and
   *  endpoint. Empty or absent: the model the host booted with. */
  model?: string;
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
  /** Tool-call iterations granted; the runtime's default when absent. */
  maxIterations?: number;
  /** The mode the host's permission gate applies to each tool call. */
  permissionMode?: string;
  /** The provider's thinking at this level (`act({effort})`); none when absent. A provider whose field does
   *  not know the level receives the highest it knows below it, with a warning in the runtime's log. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** The agent's tools offered for this call (a role's subset); all of them when absent. */
  tools?: readonly string[];
}

/** The model, as the crews call it. Every call throws when the host's provider
 *  fails; a failed `act` or `complete` throws an LlmFailure (shared/domain/llm-failure.ts). */
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
}
