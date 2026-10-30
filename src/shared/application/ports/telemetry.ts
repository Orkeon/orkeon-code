// The telemetry port: what the host reports about the session and its LLM usage.
// Types only, re-exported by ../ports.ts.

/** What the host reports about the session. A field it did not report is undefined. */
export interface SessionMetadata {
  title?: string;
  /** The model the host booted with. */
  model?: string;
  messageCount?: number;
  estimatedTokens?: number;
  /** The models the host declares (`Llm:AvailableModels`), trimmed and deduplicated. */
  availableModels?: string[];
}

/** The session's cumulative LLM usage. */
export interface SessionCost {
  costUsd?: number;
  totalTokens?: number;
  totalCalls?: number;
}

/** The session's telemetry: its LLM usage plus the buffer's counters. */
export interface SessionStats extends SessionCost {
  messageCount?: number;
  estimatedTokens?: number;
  /** Prompt tokens sent, over every model, as the providers counted them, when the host reports them. */
  promptTokens?: number;
  /** Completion tokens received, over every model, as the providers counted them, when the host reports them. */
  completionTokens?: number;
  /** Prompt tokens read from the provider's cache (the hits), summed over the models that report them; undefined
   *  when none does (Orkeon #254: not measured, never 0). */
  cacheHitTokens?: number;
  /** Prompt tokens written to the provider's cache, summed over the models that report them; undefined when none does. */
  cacheWriteTokens?: number;
  /** Completion tokens spent reasoning, summed over the models that report them; undefined when none does. */
  reasoningTokens?: number;
}

/** The host's account of the session. Each read throws when the host cannot
 *  answer it; callers that only display a value catch and show what they have. */
export interface Telemetry {
  readMetadata(): Promise<SessionMetadata>;
  readCost(): Promise<SessionCost>;
  readStats(): Promise<SessionStats>;
}
