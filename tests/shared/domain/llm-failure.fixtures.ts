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

/** The runtime's DecisionBlockedError (Orkeon #269), with the fields the host gives it. */
function decisionBlockedError(fields: { profile: string; stage: string; risk?: string; reason?: string }): Error {
  return Object.assign(new Error(`Blocked by the decision stage '${fields.stage}' of profile '${fields.profile}'`), {
    name: "DecisionBlockedError", errorType: "DecisionBlocked", ...fields,
  });
}

/** Blocks the runtime rejects with, and the block each one reads as. */
export const DECISION_BLOCKS = [
  {
    name: "reads a request the guard blocked, with its risk",
    error: () => decisionBlockedError({
      profile: "guarded", stage: "guard", risk: "prompt_injection", reason: "the request matches the risk 'prompt_injection' at 0.96",
    }),
    block: { stage: "guard", profile: "guarded", risk: "prompt_injection", reason: "the request matches the risk 'prompt_injection' at 0.96" },
  },
  {
    name: "reads a call a fail-closed stage blocked when its decision model failed, with no risk",
    error: () => decisionBlockedError({
      profile: "strict", stage: "verify",
      reason: "the decision stage failed and the profile is fail-closed: kev could not be reached at http://127.0.0.1:8009/v1: Connection refused",
    }),
    block: {
      stage: "verify", profile: "strict", risk: null,
      reason: "the decision stage failed and the profile is fail-closed: kev could not be reached at http://127.0.0.1:8009/v1: Connection refused",
    },
  },
  {
    name: "reads a block the stage gave no reason for",
    error: () => decisionBlockedError({ profile: "guarded", stage: "verify" }),
    block: { stage: "verify", profile: "guarded", risk: null, reason: null },
  },
] as const;

/** Errors that are no block: a provider failure, the host's old sentence in a marker, another error, no error. */
export const NOT_BLOCKS: readonly { readonly name: string; readonly error: () => unknown }[] = [
  { name: "a rate limit", error: () => llmFailureOf("<undefined-llm:429 Too Many Requests>") },
  {
    name: "the host's block sentence in a failure marker",
    error: () => llmFailureOf("<undefined-llm:Blocked by the decision stage 'guard' of profile 'guarded': x>"),
  },
  { name: "another error of the runtime", error: () => Object.assign(new Error("Unknown tool"), { name: "UnknownToolError" }) },
  { name: "a string", error: () => "Blocked by the decision stage 'guard' of profile 'guarded': x" },
  { name: "nothing", error: () => undefined },
];

const NEXT_STEP = "The model gave no answer; rephrase the request, or choose another profile with /config set llm.profile.";

/** Blocks and what the user reads for each. */
export const BLOCK_TEXTS = [
  {
    name: "names the profile, the stage and the reason, and what to do",
    block: DECISION_BLOCKS[0].block,
    text: `Blocked by the decision profile 'guarded' (stage 'guard'): the request matches the risk 'prompt_injection' at 0.96. ${NEXT_STEP}`,
  },
  {
    name: "names the risk when the guard gave no reason",
    block: { stage: "guard", profile: "guarded", risk: "pii", reason: null },
    text: `Blocked by the decision profile 'guarded' (stage 'guard'): the request matches the risk 'pii'. ${NEXT_STEP}`,
  },
  {
    name: "names the profile and the stage alone when the stage gave no reason",
    block: DECISION_BLOCKS[2].block,
    text: `Blocked by the decision profile 'guarded' (stage 'verify'). ${NEXT_STEP}`,
  },
] as const;
