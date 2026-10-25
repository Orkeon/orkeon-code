// The texts tidyWhitespace is tested on: each case gives the text, the text tidied and the notes it returns.

export interface TidyCase {
  /** What the text holds, as the test name says it. */
  name: string;
  text: string;
  tidied: string;
  fixed: string[];
}

export const BLANK_LINES_AT_EOF: readonly TidyCase[] = [
  {
    name: "a module a node insert left a blank line after",
    text: "export function subtract(a, b) {\n  return a - b;\n}\n\n",
    tidied: "export function subtract(a, b) {\n  return a - b;\n}\n",
    fixed: ["a blank line at EOF removed"],
  },
  { name: "a file with three blank lines at its end", text: "x\n\n\n\n", tidied: "x\n", fixed: ["3 blank lines at EOF removed"] },
  { name: "a file with one blank line at its end", text: "x\n\n", tidied: "x\n", fixed: ["a blank line at EOF removed"] },
];

export const TRAILING_WHITESPACE: readonly TidyCase[] = [
  { name: "spaces and a tab at the end of two lines", text: "a  \nb\t\nc\n", tidied: "a\nb\nc\n", fixed: ["trailing whitespace on 2 lines"] },
  {
    name: "a last line of spaces only",
    text: "a \n \n",
    tidied: "a\n",
    fixed: ["trailing whitespace on 2 lines", "a blank line at EOF removed"],
  },
];

/** Texts with nothing to tidy: a final newline or none, an empty file, a blank line inside. */
export const CLEAN_TEXTS: readonly string[] = ["a\nb\n", "a\nb", "", "\n", "a\n\nb\n"];
