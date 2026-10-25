import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { tidyWhitespace } from "./whitespace.ts";

describe("tidyWhitespace", () => {
  it("removes the blank lines at the end of a file, its final newline kept", () => {
    deepStrictEqual(tidyWhitespace("export function subtract(a, b) {\n  return a - b;\n}\n\n"),
      { text: "export function subtract(a, b) {\n  return a - b;\n}\n", fixed: ["a blank line at EOF removed"] });
    deepStrictEqual(tidyWhitespace("x\n\n\n\n"), { text: "x\n", fixed: ["3 blank lines at EOF removed"] });
    deepStrictEqual(tidyWhitespace("x\n\n"), { text: "x\n", fixed: ["a blank line at EOF removed"] });
  });

  it("strips trailing spaces and tabs, and counts the lines", () => {
    deepStrictEqual(tidyWhitespace("a  \nb\t\nc\n"), { text: "a\nb\nc\n", fixed: ["trailing whitespace on 2 lines"] });
    deepStrictEqual(tidyWhitespace("a \n \n"), { text: "a\n", fixed: ["trailing whitespace on 2 lines", "a blank line at EOF removed"] });
  });

  it("leaves a clean file as it is, with or without a final newline, and an empty one", () => {
    for (const text of ["a\nb\n", "a\nb", "", "\n", "a\n\nb\n"]) deepStrictEqual(tidyWhitespace(text), { text, fixed: [] });
  });
});
