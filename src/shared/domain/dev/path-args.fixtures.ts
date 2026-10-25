// The calls a relative path is resolved in, and those left as they are.
import { WORKSPACE } from "../vfs.ts";

const ROOT = `${WORKSPACE}/.orkeon/worktrees/calc-F1`;

export interface ResolveCase { name: string; tool: string; input: unknown; base?: string; expected: unknown | null }

export const RESOLVE_CASES: readonly ResolveCase[] = [
  { name: "resolves a relative path of file_read under the checkout", tool: "file_read", input: { path: "src/a.ts", limit: 12 }, expected: { path: `${WORKSPACE}/src/a.ts`, limit: 12 } },
  { name: "resolves a relative path of node_outline under a batch's root", tool: "node_outline", input: { path: "src/a.ts" }, base: ROOT, expected: { path: `${ROOT}/src/a.ts` } },
  { name: "resolves a relative path of a writer", tool: "node_replace", input: { path: "./src/a.ts", selector: "f(any)", text: "x" }, expected: { path: `${WORKSPACE}/src/a.ts`, selector: "f(any)", text: "x" } },
  { name: "resolves a leading .. as the guard does: it climbs out of the base", tool: "file_read", input: { path: "../src/a.ts" }, expected: { path: "/src/a.ts" } },
  { name: "leaves an absolute path as it is", tool: "file_read", input: { path: `${WORKSPACE}/src/a.ts` }, expected: null },
  { name: "leaves another mount as it is", tool: "file_read", input: { path: "/output/jobs/j1.log" }, expected: null },
  { name: "leaves a call without a path as it is", tool: "node_outline", input: { selector: "src/a.ts" }, expected: null },
  { name: "leaves a tool that takes no path as it is", tool: "shell_command", input: { command: "cat src/a.ts" }, expected: null },
  { name: "leaves an input that is no object as it is", tool: "file_read", input: "src/a.ts", expected: null },
  {
    name: "resolves each relative operation of an edit_batch and keeps the absolute ones",
    tool: "edit_batch",
    input: { validate: "parse", operations: [{ kind: "node_replace", path: "src/a.ts", text: "x" }, { kind: "node_insert", path: `${WORKSPACE}/docs/b.md`, text: "y" }, "not an operation"] },
    expected: { validate: "parse", operations: [{ kind: "node_replace", path: `${WORKSPACE}/src/a.ts`, text: "x" }, { kind: "node_insert", path: `${WORKSPACE}/docs/b.md`, text: "y" }, "not an operation"] },
  },
  { name: "leaves an edit_batch whose operations are all absolute as it is", tool: "edit_batch", input: { operations: [{ kind: "node_replace", path: `${WORKSPACE}/src/a.ts`, text: "x" }] }, expected: null },
];
