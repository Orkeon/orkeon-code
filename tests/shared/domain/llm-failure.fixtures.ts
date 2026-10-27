// Markers and answers for the llmFailureOf tests.

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
