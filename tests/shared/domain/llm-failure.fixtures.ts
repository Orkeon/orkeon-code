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
