// A model call the host's provider failed. Orkeon does not throw then: `act`
// resolves its `output`, and `complete` its text, to the marker
// `<undefined-llm:<the provider's error>>` (also what a host without a provider
// echoes). Read as an answer, the marker would be stored, summarised, written or
// committed as if the model had said it, so the Llm adapter throws this failure
// instead. Pure, no IO.

const MARKER = /^<undefined-llm:([\s\S]*)>$/;

/** The longest provider error a failure carries: a host without a provider echoes the whole prompt. */
const MAX_DETAIL = 300;

/** The error a failed model call throws, told apart by its `name`. */
export interface LlmFailure extends Error {
  name: "LlmFailure";
  /** The provider's error, as the marker carried it (cut at MAX_DETAIL characters). */
  detail: string;
}

/** The failure a model's text stands for, or null when the text is an answer. */
export function llmFailureOf(text: unknown): LlmFailure | null {
  const m = typeof text === "string" ? MARKER.exec(text) : null;
  if (!m) return null;
  const detail = m[1].length > MAX_DETAIL ? `${m[1].slice(0, MAX_DETAIL)}…` : m[1];
  // A plain Error with a name rather than a subclass: subclassing Error is not
  // something the bundles rely on anywhere else, in Jint or in Node.
  const failure = new Error(`the model call failed: ${detail}`) as LlmFailure;
  failure.name = "LlmFailure";
  failure.detail = detail;
  return failure;
}
