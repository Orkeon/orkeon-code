// The inputs the command argument parsers are tested on, each case with what it parses to.
import type { ParsedMemory } from "../../../src/commands/_lib/args.ts";

export interface MemoryArgsCase {
  name: string;
  tokens: string[];
  expected: ParsedMemory;
}

export const MEMORY_ARGS_CASES: readonly MemoryArgsCase[] = [
  { name: "defaults to list with no category", tokens: [], expected: { sub: "list", category: undefined } },
  { name: "list with a known category", tokens: ["list", "project"], expected: { sub: "list", category: "project" } },
  { name: "list ignores an unknown category", tokens: ["list", "frobnik"], expected: { sub: "list", category: undefined } },
  {
    name: "add with explicit category consumes it",
    tokens: ["add", "feedback", "be", "concise"],
    expected: { sub: "add", category: "feedback", content: "be concise" },
  },
  {
    name: "add without a category defaults to user and keeps all content",
    tokens: ["add", "remember", "this"],
    expected: { sub: "add", category: "user", content: "remember this" },
  },
  { name: "delete coerces the id to a number", tokens: ["delete", "7"], expected: { sub: "delete", id: 7 } },
  { name: "get coerces the id to a number", tokens: ["get", "3"], expected: { sub: "get", id: 3 } },
];

export interface AssistantInputCase {
  name: string;
  input: string;
  expected: { permissionMode: string | null; prompt: string };
}

export const ASSISTANT_INPUT_CASES: readonly AssistantInputCase[] = [
  {
    name: "returns a null mode when no prefix is given (session default applies)",
    input: "refactor X",
    expected: { permissionMode: null, prompt: "refactor X" },
  },
  { name: "extracts a leading permission mode", input: "plan: design the API", expected: { permissionMode: "plan", prompt: "design the API" } },
  {
    name: "an explicit default: prefix pins the mode (not null)",
    input: "default: refactor X",
    expected: { permissionMode: "default", prompt: "refactor X" },
  },
  { name: "only treats known modes as a prefix", input: "todo: not a mode", expected: { permissionMode: null, prompt: "todo: not a mode" } },
  {
    name: "handles multi-line prompts after the mode",
    input: "acceptEdits: line1\nline2",
    expected: { permissionMode: "acceptEdits", prompt: "line1\nline2" },
  },
];

export const RAW_TEXT_CASES: readonly { name: string; args: object; expected: string }[] = [
  { name: "rawText joins + trims the raw tokens", args: { raw: ["a", "b"] }, expected: "a b" },
  { name: "rawText is empty without raw tokens", args: {}, expected: "" },
];

export const RAW_TOKENS_CASES: readonly { name: string; args: object; expected: string[] }[] = [
  { name: "rawTokens returns the array", args: { raw: ["x"] }, expected: ["x"] },
  { name: "rawTokens returns [] without raw tokens", args: {}, expected: [] },
];

/** A JSON payload that is not an object, and the word the refusal names it with. */
export const NOT_OBJECT_PAYLOADS: readonly { payload: string; word: string }[] = [
  { payload: "[1,2]", word: "array" },
  { payload: '"a"', word: "string" },
  { payload: "7", word: "number" },
];

export const BAD_TOOL_NAMES: readonly string[] = ["", "  ", "file-read", "/etc/passwd", "9tool"];

export interface SplitCase {
  name: string;
  line: string;
  words: string[];
}

export const SPLIT_CASES: readonly SplitCase[] = [
  {
    name: "splits on blanks and keeps a double-quoted argument whole",
    line: `daily.m4a --then "liste les tâches qu'il cite"`,
    words: ["daily.m4a", "--then", "liste les tâches qu'il cite"],
  },
  { name: "keeps a single-quoted argument whole", line: `'my note.m4a' --lang fr`, words: ["my note.m4a", "--lang", "fr"] },
  {
    name: "leaves a quote inside a word alone: a quote closed inside a word closes nothing",
    line: `--then l'API "rate"limit`,
    words: ["--then", "l'API", `"rate"limit`],
  },
  { name: "splits a blank line into no word", line: "   ", words: [] },
  { name: "reads a double quote that is never closed as a letter", line: `a "never closed`, words: ["a", `"never`, "closed"] },
  { name: "reads a single quote that is never closed as a letter", line: `the '90s --voice x`, words: ["the", "'90s", "--voice", "x"] },
];

/** A line with an option given a quoted word. */
export const QUOTED_LINE = `--then say "deadline" now`;

/** A line whose options have a value, a blank value, no value and another option after them. */
export const OPTIONS_LINE = `--lang fr --voice "" --max --x`;

export const OPTION_VALUE_CASES: readonly { name: string; at: number; value: string | null }[] = [
  { name: "gives an option its value", at: 0, value: "fr" },
  { name: "gives no value to an option whose value is blank", at: 2, value: null },
  { name: "gives no value to an option followed by another option", at: 4, value: null },
  { name: "gives no value to an option at the end of the line", at: 6, value: null },
];

export const IS_OPTION_CASES: readonly { name: string; line: string | null; expected: boolean }[] = [
  { name: "reads a word starting with -- as an option", line: "--then", expected: true },
  { name: "does not read a quoted --word as an option", line: `"--stop"`, expected: false },
  { name: "does not read a missing word as an option", line: null, expected: false },
];

export const ROUND_TRIP_CASES: readonly { name: string; tokens: string[] }[] = [
  { name: "a token holding a blank", tokens: ["--then", "list the tasks"] },
  { name: "tokens that a quoted argument was split into", tokens: ["--then", `"list`, "the", `tasks"`] },
];

export const COMPACT_CASES: readonly { name: string; tokens: string[]; expected: { snip: number } | { focus: string } }[] = [
  { name: "reads --snip with how many exchanges to keep", tokens: ["--snip", "5"], expected: { snip: 5 } },
  { name: "keeps 3 exchanges for a --snip without a count", tokens: ["--snip"], expected: { snip: 3 } },
  { name: "keeps 3 exchanges for a --snip whose count is not a number", tokens: ["--snip", "zero"], expected: { snip: 3 } },
  { name: "reads anything else as the summary's focus", tokens: ["keep", "the", "test", "names"], expected: { focus: "keep the test names" } },
  { name: "reads no token as an empty focus", tokens: [], expected: { focus: "" } },
];
