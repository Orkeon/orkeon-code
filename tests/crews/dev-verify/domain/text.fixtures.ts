// The texts the text helpers are tested on.

export interface FirstLineCase {
  name: string;
  text: string;
  expected: string;
}

export const FIRST_LINE_CASES: readonly FirstLineCase[] = [
  { name: "a padded line followed by another", text: "  boom  \nsecond", expected: "boom" },
  { name: "the empty text", text: "", expected: "" },
];

export interface StdoutLinesCase {
  name: string;
  text: string;
  expected: readonly string[];
}

export const STDOUT_LINES_CASES: readonly StdoutLinesCase[] = [
  { name: "CRLF lines with a final newline", text: "a\r\nb\n", expected: ["a", "b"] },
  { name: "lines without a final newline", text: "a\nb", expected: ["a", "b"] },
  { name: "the empty text", text: "", expected: [] },
  { name: "a lone newline", text: "\n", expected: [""] },
];

export interface CutCase {
  name: string;
  text: string;
  max: number;
  expected: string;
}

export const CUT_CASES: readonly CutCase[] = [
  { name: "keeps a text as long as the limit", text: "abc", max: 3, expected: "abc" },
  { name: "ends a text past the limit with an ellipsis", text: "abcd", max: 3, expected: "ab…" },
];
