// The tool results runtimeCut is tested on.

/** The notice the runtime appends to a result it cut. */
export const NOTICE = "\n\n[... truncated, 1234 chars omitted. Use more specific parameters to narrow results.]";

/** A notice that says no character was omitted, at the end of a result. */
export const ZERO_NOTICE_TEXT =
  "src/a.ts\n\n[... truncated, 0 chars omitted. Use more specific parameters to narrow results.]";

export interface WholeCase {
  name: string;
  text: string;
}

/** Results without the notice: kept whole. */
export const WHOLE_RESULTS: readonly WholeCase[] = [
  { name: "a list of paths", text: "src/a.ts\nsrc/b.ts\n" },
  { name: "the empty result", text: "" },
];
