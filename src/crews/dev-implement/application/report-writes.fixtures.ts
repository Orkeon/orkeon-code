// The role callbacks and the tool calls the write report is tested on.

export interface ToolCall { name: string; input: unknown }

/** Callbacks that deny a call naming the path `deny`, and allow every other one. */
export const inner = (deny: string) => ({
  forAct: (_mode: string, _gate: boolean | undefined) => ({
    onToolCall: async (call: ToolCall): Promise<"allow" | { deny: string }> => ((call.input as { path?: string }).path === deny ? { deny: "no" } : "allow"),
    onToolResult: async () => undefined,
  }),
});

/** A write let through, a write denied (the callbacks deny `src/x.ts`), a read, then a write let through. */
export const WRITE_DENY_READ_WRITE: readonly ToolCall[] = [
  { name: "file_write", input: { path: "tests/a.test.ts" } },
  { name: "edit_file", input: { path: "src/x.ts" } },
  { name: "file_read", input: { path: "src/y.ts" } },
  { name: "edit_file", input: { path: "src/z.ts" } },
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
