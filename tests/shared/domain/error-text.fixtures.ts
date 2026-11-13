// The cases of errorText: what is thrown and the one line it gives.
import { ERROR_TEXT_CHARS } from "../../../src/shared/domain/error-text.ts";

export interface ErrorTextCase { name: string; error: unknown; expected: string }

const LONG = "a".repeat(ERROR_TEXT_CHARS + 100);

/** What the runtime throws for a reply cut short (Orkeon #353): the facts, then the reply's first and last 200
 *  characters. */
const CUT_REPLY =
  "ctx.llm.extract: the provider returned non-JSON content (cut short: the output budget ran out); " +
  "JSON error at line 1, byte 9812: Expected depth to be zero at the end of the JSON payload. " +
  "[finish_reason: length, prompt_tokens: 11234, completion_tokens: 24576, reasoning_tokens: 23901]. " +
  `Reply (9812 chars) starts: {"steps":[${"s".repeat(190)} ... ends: ${"e".repeat(190)}"last step`;

export const ERROR_TEXT_CASES: readonly ErrorTextCase[] = [
  {
    name: "keeps the raw reply quoted after a line break, on the same line",
    error: new Error('ctx.llm.extract: provider returned non-JSON content. Raw: {\n  "steps": [\n    "a\\$"'),
    expected: 'ctx.llm.extract: provider returned non-JSON content. Raw: { "steps": [ "a\\$"',
  },
  {
    name: "keeps the end of a reply cut short, quoted after its start and the tokens spent",
    error: new Error(CUT_REPLY),
    expected: CUT_REPLY,
  },
  { name: "takes a thrown string as it is", error: "not JSON", expected: "not JSON" },
  { name: "drops the blanks at both ends", error: new Error("\n  bad json \n"), expected: "bad json" },
  {
    name: `cuts a message over ${ERROR_TEXT_CHARS} characters with an ellipsis`,
    error: new Error(LONG),
    expected: `${"a".repeat(ERROR_TEXT_CHARS - 1)}…`,
  },
];
