// Markers and answers for the llmFailureOf tests.
import { llmFailureOf } from "../../../src/shared/domain/llm-failure.ts";

/** Markers whose detail is read as it is. */
export const MARKER_DETAILS: readonly { readonly name: string; readonly marker: string; readonly detail: string }[] = [
  { name: "reads a marker over several lines", marker: "<undefined-llm:line one\nline two>", detail: "line one\nline two" },
  { name: "reads an empty marker", marker: "<undefined-llm:>", detail: "" },
];

/** Answers that are no failure, even one that mentions the marker. */
export const ANSWERS: readonly unknown[] = [
  "", "Done: the parser is fixed.", "The host answers <undefined-llm:...> when it fails.",
  "<undefined-llm:open", " <undefined-llm:x>", null, undefined, 42,
];

/** Failures that are no wrap-up: the runtime's own BudgetExhaustedError (no answer), another error, no error. */
export const NOT_WRAP_UPS: readonly { readonly name: string; readonly failure: unknown }[] = [
  { name: "the runtime's rejection, which carries no answer", failure: Object.assign(new Error("Token budget exhausted"), { name: "BudgetExhaustedError", dimension: "tokens" }) },
  { name: "another error", failure: new Error("connection reset") },
  { name: "a string", failure: "Token budget exhausted" },
  { name: "nothing", failure: undefined },
];

/** The host's sentences for a blocked call, as the marker carries them, and the block each one reads as. */
export const DECISION_BLOCKS = [
  {
    name: "reads a request the guard blocked",
    marker: "<undefined-llm:Blocked by the decision stage 'guard' of profile 'guarded': the request matches the risk 'prompt_injection' at 0.96>",
    block: { stage: "guard", profile: "guarded", reason: "the request matches the risk 'prompt_injection' at 0.96" },
  },
  {
    name: "reads a call a fail-closed stage blocked when its decision model failed",
    marker: "<undefined-llm:Blocked by the decision stage 'guard' of profile 'strict': the decision stage failed and the profile is fail-closed: kev could not be reached at http://127.0.0.1:8009/v1: Connection refused>",
    block: { stage: "guard", profile: "strict", reason: "the decision stage failed and the profile is fail-closed: kev could not be reached at http://127.0.0.1:8009/v1: Connection refused" },
  },
] as const;

/** Errors that are no block: another provider failure, the sentence on another error, no error. */
export const NOT_BLOCKS: readonly { readonly name: string; readonly error: () => unknown }[] = [
  { name: "a rate limit", error: () => llmFailureOf("<undefined-llm:429 Too Many Requests>") },
  { name: "the sentence on an error that is no LlmFailure", error: () => new Error("Blocked by the decision stage 'guard' of profile 'guarded': x") },
  { name: "a string", error: () => "Blocked by the decision stage 'guard' of profile 'guarded': x" },
  { name: "nothing", error: () => undefined },
];

/** The block the text test reads. */
export const GUARD_BLOCK = DECISION_BLOCKS[0].block;

/** What the user reads for GUARD_BLOCK. */
export const GUARD_BLOCK_TEXT =
  "Blocked by the decision profile 'guarded' (stage 'guard'): the request matches the risk 'prompt_injection' at 0.96. " +
  "The model gave no answer; rephrase the request, or choose another profile with /config set llm.profile.";
