// The write paths heard from a role's callbacks. Run:
//   node --test src/crews/dev-implement/application/report-writes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { reportingWrites, writtenPaths } from "./report-writes.ts";

const inner = (deny: string) => ({
  forAct: (_mode: string, _gate: boolean | undefined) => ({
    onToolCall: async (call: { name: string; input: unknown }): Promise<"allow" | { deny: string }> => ((call.input as { path?: string }).path === deny ? { deny: "no" } : "allow"),
    onToolResult: async () => undefined,
  }),
});

describe("reportingWrites", () => {
  it("reports the path of a write let through, never a denied one or a read", async () => {
    const heard: string[] = [];
    const act = reportingWrites(inner("src/x.ts"), (p) => heard.push(p)).forAct("acceptEdits", true);
    strictEqual(await act.onToolCall({ name: "file_write", input: { path: "tests/a.test.ts" } }), "allow");
    deepStrictEqual(await act.onToolCall({ name: "edit_file", input: { path: "src/x.ts" } }), { deny: "no" });
    await act.onToolCall({ name: "file_read", input: { path: "src/y.ts" } });
    await act.onToolCall({ name: "edit_file", input: { path: "src/z.ts" } });
    deepStrictEqual(heard, ["tests/a.test.ts", "src/z.ts"]);
  });

  it("reports the node editors' path and every operation's path of an edit_batch let through", async () => {
    const heard: string[] = [];
    const act = reportingWrites(inner("src/x.ts"), (p) => heard.push(p)).forAct("acceptEdits", true);
    for (const name of ["node_replace", "node_insert", "node_ensure"]) await act.onToolCall({ name, input: { path: `src/${name}.ts` } });
    await act.onToolCall({ name: "node_read", input: { path: "src/read.ts" } });
    await act.onToolCall({ name: "edit_batch", input: { operations: [{ path: "src/a.ts" }, { kind: "x" }, null, { path: "docs/b.md" }] } });
    await act.onToolCall({ name: "edit_batch", input: { operations: "src/c.ts" } });
    deepStrictEqual(heard, ["src/node_replace.ts", "src/node_insert.ts", "src/node_ensure.ts", "src/a.ts", "docs/b.md"]);
    deepStrictEqual(writtenPaths("edit_batch", null), []);
    // The guard compares tool names without case: so does the report.
    deepStrictEqual(writtenPaths("Edit_Batch", { operations: [{ path: "src/d.ts" }] }), ["src/d.ts"]);
    deepStrictEqual(writtenPaths("NODE_REPLACE", { path: "src/e.ts" }), ["src/e.ts"]);
  });
});
