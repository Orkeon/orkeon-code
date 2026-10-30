// Calls and results a turn makes, for the tool-trace tests.
import type { ToolCallTrace } from "../../../src/shared/domain/tool-trace.ts";

export interface TraceCase {
  readonly name: string;
  readonly tool: string;
  readonly input: unknown;
  readonly result: unknown;
  readonly expected: ToolCallTrace;
}

/** One call each, and the line the trace keeps of it. */
export const TRACE_CASES: readonly TraceCase[] = [
  {
    name: "keeps a grep count as its matches and files",
    tool: "grep",
    input: { path: "src", glob: "**/*.cs", pattern: "sealed class", output_mode: "count", max_files: 5000 },
    result: { total_matches: 1589, files_matched: 1200, scan_complete: true, counts: [{ path: "a.cs", count: 3 }] },
    expected: {
      tool: "grep", args: "path=src, pattern=sealed class, glob=**/*.cs, output_mode=count", outcome: "1589 matches in 1200 files",
    },
  },
  {
    name: "says a scan was incomplete and cut",
    tool: "grep",
    input: { path: "src", pattern: "x" },
    result: { total_matches: 40, scan_complete: false, truncated: true },
    expected: { tool: "grep", args: "path=src, pattern=x", outcome: "40 matches, incomplete scan, truncated" },
  },
  {
    name: "keeps a file's read as its line count, never its content",
    tool: "file_read",
    input: { path: "README.md", offset: 1, limit: 3 },
    result: "# Title\nline two\nthe secret plan",
    expected: { tool: "file_read", args: "path=README.md, offset=1, limit=3", outcome: "3 lines" },
  },
  {
    name: "keeps an error's first line",
    tool: "shell_command",
    input: { command: "ls missing" },
    result: { error: "no such file\nat line 2" },
    expected: { tool: "shell_command", args: "command=ls missing", outcome: "error: no such file" },
  },
  {
    name: "reads a text that starts with Error as an error",
    tool: "file_read",
    input: { path: "gone.txt" },
    result: "Error: file not found",
    expected: { tool: "file_read", args: "path=gone.txt", outcome: "error: file not found" },
  },
  {
    name: "keeps an exit code",
    tool: "shell_command",
    input: { command: "npm test" },
    result: { exit_code: 1, stdout: "1 failing" },
    expected: { tool: "shell_command", args: "command=npm test", outcome: "exit 1" },
  },
  {
    name: "counts a listed result",
    tool: "glob",
    input: { pattern: "**/*.ts" },
    result: { files: ["a.ts", "b.ts"] },
    expected: { tool: "glob", args: "pattern=**/*.ts", outcome: "2 files" },
  },
  {
    name: "drops what a write carries",
    tool: "file_write",
    input: { path: "a.txt", content: "the whole file" },
    result: { ok: true },
    expected: { tool: "file_write", args: "path=a.txt", outcome: "ok" },
  },
  {
    name: "cuts a long command at sixty characters",
    tool: "shell_command",
    input: { command: "echo " + "a".repeat(80) },
    result: "",
    expected: { tool: "shell_command", args: "command=echo " + "a".repeat(54) + "…", outcome: "empty" },
  },
  {
    name: "redacts an argument that holds a secret",
    tool: "shell_command",
    input: { command: "curl -H 'x-api-key: sk-ant-api03-" + "A".repeat(40) + "'" },
    result: "ok",
    expected: { tool: "shell_command", args: "command=(redacted)", outcome: "1 line" },
  },
  {
    name: "keeps no argument when the input is not an object",
    tool: "session_store",
    input: "get",
    result: null,
    expected: { tool: "session_store", args: "", outcome: "no result" },
  },
];

/** A call line as formatToolTrace writes it. */
export function call(tool: string, args = "", outcome = "ok"): ToolCallTrace {
  return { tool, args, outcome };
}

/** Calls with distinct arguments, `f0` to `f<count - 1>`. */
export function distinctCalls(count: number): ToolCallTrace[] {
  return Array.from({ length: count }, (_, i) => call("file_read", `path=f${i}`, "1 line"));
}
