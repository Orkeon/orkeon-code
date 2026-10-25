// The tool results the normaliser is tested on, each with the value it reads from them. The live payloads were
// captured from real calls in this host (B-14, 2026-08-05), read with `/debug-tool-call <tool> {json}`.

export interface ReadCase<T> {
  /** What the result holds, as the test name says it. */
  name: string;
  result: unknown;
  expected: T;
}

export interface PickCase {
  name: string;
  object: unknown;
  names: string[];
  expected: unknown;
}

export const PICKS: readonly PickCase[] = [
  { name: "prefers an earlier name, falling through to a later one present", object: { b: 2 }, names: ["a", "b"], expected: 2 },
  { name: "tolerates casing, the earlier name winning", object: { A: 1, a: 9 }, names: ["a", "A"], expected: 9 },
  { name: "reads undefined from an undefined object", object: undefined, names: ["x"], expected: undefined },
];

export const STDOUTS: readonly ReadCase<string>[] = [
  { name: "stdout", result: { stdout: "a" }, expected: "a" },
  { name: "Stdout", result: { Stdout: "b" }, expected: "b" },
  { name: "nothing, as empty", result: {}, expected: "" },
];

export const STDERRS: readonly ReadCase<string>[] = [
  { name: "stderr", result: { stderr: "e" }, expected: "e" },
  { name: "Stderr", result: { Stderr: "E" }, expected: "E" },
];

export const EXIT_CODES: readonly ReadCase<number>[] = [
  { name: "exit_code", result: { exit_code: 0 }, expected: 0 },
  { name: "exitCode", result: { exitCode: 2 }, expected: 2 },
  { name: "ExitCode", result: { ExitCode: 3 }, expected: 3 },
  { name: "nothing, as -1", result: {}, expected: -1 },
];

export const CONTENTS: readonly ReadCase<string>[] = [
  { name: "content", result: { content: "x" }, expected: "x" },
  { name: "Content", result: { Content: "y" }, expected: "y" },
  { name: "text", result: { text: "z" }, expected: "z" },
  { name: "Text", result: { Text: "t" }, expected: "t" },
  { name: "nothing, as empty", result: {}, expected: "" },
  { name: "a bare string result, as the content", result: "plain", expected: "plain" },
];

export const ARRAYS: readonly ReadCase<unknown[]>[] = [
  { name: "passes an array as it is", result: [1, 2], expected: [1, 2] },
  { name: "coerces null to []", result: null, expected: [] },
  { name: "coerces an object to []", result: { a: 1 }, expected: [] },
];

export const ENTRY_NAMES: readonly ReadCase<string[]>[] = [
  {
    name: "reads the real Files + Directories shape",
    result: { Files: [{ Name: "index.ts" }, { Name: "math.ts" }], Directories: [{ Name: "sub" }] },
    expected: ["index.ts", "math.ts", "sub"],
  },
  { name: "tolerates the legacy entries shape, a name or a Path", result: { entries: [{ name: "a" }, { Path: "b" }] }, expected: ["a", "b"] },
  { name: "tolerates the legacy Entries casing of bare names", result: { Entries: ["c"] }, expected: ["c"] },
  { name: "returns [] for an empty listing", result: {}, expected: [] },
];

/** What file_read returned live: { content, file_info }. */
export const CAPTURED_FILE_READ = {
  content: "# sample-repo\n\nThrowaway TypeScript fixture…\n",
  file_info: { size: 206 },
};

/** What session_stats returned live: snake_case counters. */
export const CAPTURED_SESSION_STATS = {
  message_count: 0, estimated_tokens: 0,
  total_cost_usd: 0, total_tokens: 0, total_calls: 0, by_model: {},
};

export interface CounterCase {
  name: string;
  names: [string, string];
}

/** The counters read from the captured session_stats, by their snake_case name then their camelCase one. */
export const SESSION_STATS_COUNTERS: readonly CounterCase[] = [
  { name: "total_calls", names: ["total_calls", "totalCalls"] },
  { name: "estimated_tokens", names: ["estimated_tokens", "estimatedTokens"] },
];
