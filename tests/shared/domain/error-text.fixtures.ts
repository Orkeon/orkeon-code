// The cases of errorText: what is thrown and the one line it gives.
import { ERROR_TEXT_CHARS } from "../../../src/shared/domain/error-text.ts";

export interface ErrorTextCase { name: string; error: unknown; expected: string }

const LONG = "a".repeat(ERROR_TEXT_CHARS + 100);

export const ERROR_TEXT_CASES: readonly ErrorTextCase[] = [
  {
    name: "keeps the raw reply quoted after a line break, on the same line",
    error: new Error('ctx.llm.extract: provider returned non-JSON content. Raw: {\n  "steps": [\n    "a\\$"'),
    expected: 'ctx.llm.extract: provider returned non-JSON content. Raw: { "steps": [ "a\\$"',
  },
  { name: "takes a thrown string as it is", error: "not JSON", expected: "not JSON" },
  { name: "drops the blanks at both ends", error: new Error("\n  bad json \n"), expected: "bad json" },
  {
    name: `cuts a message over ${ERROR_TEXT_CHARS} characters with an ellipsis`,
    error: new Error(LONG),
    expected: `${"a".repeat(ERROR_TEXT_CHARS - 1)}…`,
  },
];
