// The write paths heard from a role's callbacks. Run:
//   node --test src/crews/dev-implement/application/report-writes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { reportingWrites } from "./report-writes.ts";

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
});
