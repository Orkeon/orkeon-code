// The role callbacks and the tool calls the write report is tested on.

export interface ToolCall { name: string; input: unknown }

/** Callbacks that allow every call, and whose onToolResult records what it receives and answers a context. */
export const inner = (received: unknown[] = []) => ({
  forAct: (_mode: string, _gate: boolean | undefined) => ({
    onToolCall: async (_call: ToolCall): Promise<"allow" | { deny: string }> => "allow",
    onToolResult: async (_call: ToolCall, result: unknown): Promise<{ context: string }> => { received.push(result); return { context: "seen" }; },
  }),
});

/** What the host answers for a call its gate refused, as the model and onToolResult read it. */
export const GATE_REFUSAL = "DENIED: Blocked by the permission gate: deny edit_file path=src/x.ts";

/** A write that ran, a write the gate refused, a read, then a write that ran. */
export const WRITE_REFUSED_READ_WRITE: readonly { call: ToolCall; result: unknown }[] = [
  { call: { name: "file_write", input: { path: "tests/a.test.ts" } }, result: { written: true } },
  { call: { name: "edit_file", input: { path: "src/x.ts" } }, result: GATE_REFUSAL },
  { call: { name: "file_read", input: { path: "src/y.ts" } }, result: "content" },
  { call: { name: "edit_file", input: { path: "src/z.ts" } }, result: "ok" },
];

export interface RefusedCase { name: string; result: unknown; expected: boolean }

/** Only the host's refusal, a `DENIED:` text, is one: a tool's own error ran the call, an object is a result. */
export const REFUSED_CASES: readonly RefusedCase[] = [
  { name: "is the gate's refusal", result: GATE_REFUSAL, expected: true },
  { name: "is the guardian's refusal", result: "DENIED: Blocked by Guardian (ToolExecution): secret", expected: true },
  { name: "is not a tool error", result: "ERROR: tool failed", expected: false },
  { name: "is not a JSON result", result: { error: "not found" }, expected: false },
  { name: "is not a text mentioning a denial", result: "the file says DENIED: nothing", expected: false },
];

/** The three node editors, a node read, an edit_batch of mixed operations, and one whose operations are no list. */
export const NODE_EDITORS_AND_BATCHES: readonly ToolCall[] = [
  ...["node_replace", "node_insert", "node_ensure"].map((name) => ({ name, input: { path: `src/${name}.ts` } })),
  { name: "node_read", input: { path: "src/read.ts" } },
  { name: "edit_batch", input: { operations: [{ path: "src/a.ts" }, { kind: "x" }, null, { path: "docs/b.md" }] } },
  { name: "edit_batch", input: { operations: "src/c.ts" } },
];

export const NODE_EDITORS_AND_BATCHES_HEARD: readonly string[] = [
  "src/node_replace.ts", "src/node_insert.ts", "src/node_ensure.ts", "src/a.ts", "docs/b.md",
];

export interface WrittenCase {
  name: string;
  tool: string;
  input: unknown;
  expected: string[];
}

/** The guard compares tool names without case: so does the report. */
export const WRITTEN_CASES: readonly WrittenCase[] = [
  { name: "names no path of an edit_batch without input", tool: "edit_batch", input: null, expected: [] },
  { name: "names the operations' paths of an edit_batch whatever the case of its name", tool: "Edit_Batch", input: { operations: [{ path: "src/d.ts" }] }, expected: ["src/d.ts"] },
  { name: "names the path of a node editor whatever the case of its name", tool: "NODE_REPLACE", input: { path: "src/e.ts" }, expected: ["src/e.ts"] },
];
