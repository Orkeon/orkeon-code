// The working root of a batch, and the paths and texts rebased on it and back.

export const ROOT = "/workspace/.orkeon/worktrees/prune-F2";

export interface RebaseCase {
  name: string;
  input: string;
  /** The root to rebase on; undefined or null for none. */
  root: string | null | undefined;
  expected: string;
}

/** toRoot: /workspace and a path under it, onto the root. */
export const TO_ROOT_MAPPED: readonly RebaseCase[] = [
  { name: "/workspace", input: "/workspace", root: ROOT, expected: ROOT },
  { name: "/workspace/", input: "/workspace/", root: ROOT, expected: `${ROOT}/` },
  { name: "a file under /workspace", input: "/workspace/src/a.ts", root: ROOT, expected: `${ROOT}/src/a.ts` },
];

/** toRoot keeps these: a path already under the root, a relative path, another mount and a look-alike. */
export const TO_ROOT_KEPT: readonly string[] = [
  `${ROOT}/src/a.ts`, ROOT, "src/a.ts", "/output/jobs/1.log", "/tmp/x", "/workspaces/a", "/workspace-old/a",
];

/** toRoot without a root. */
export const TO_ROOT_NO_ROOT: readonly RebaseCase[] = [
  ...["/workspace/src/a.ts", "/workspace", "src/a.ts"].map((p) => ({ name: `${p}, no root given`, input: p, root: undefined, expected: p })),
  { name: "/workspace/a, a null root", input: "/workspace/a", root: null, expected: "/workspace/a" },
];

/** fromRoot: the root and a path under it, back to /workspace. */
export const FROM_ROOT_MAPPED: readonly RebaseCase[] = [
  { name: "the root", input: ROOT, root: ROOT, expected: "/workspace" },
  { name: "a file under the root", input: `${ROOT}/src/a.ts`, root: ROOT, expected: "/workspace/src/a.ts" },
];

/** fromRoot keeps anything else, and is the identity without a root. */
export const FROM_ROOT_KEPT: readonly RebaseCase[] = [
  ...["/workspace/src/a.ts", `${ROOT}-x/a`, "src/a.ts", "/output/a"].map((p) => ({ name: p, input: p, root: ROOT, expected: p })),
  { name: "a path under the root, no root given", input: `${ROOT}/a`, root: undefined, expected: `${ROOT}/a` },
];

/** A text naming /workspace paths, one already under the root and a look-alike. */
export const MIXED_TEXT = `Read /workspace/workbench/prune/PRUNE-PLAN-F2.md, then ${ROOT}/src/a.ts and "/workspace". Not /workspaces/x.`;
export const MIXED_TEXT_ON_ROOT = `Read ${ROOT}/workbench/prune/PRUNE-PLAN-F2.md, then ${ROOT}/src/a.ts and "${ROOT}". Not /workspaces/x.`;

/** textToRoot: a path inside a command and after a separator. */
export const IN_COMMANDS: readonly RebaseCase[] = [
  { name: "inside a command", input: "cd /workspace && cat '/workspace/a b'", root: ROOT, expected: `cd ${ROOT} && cat '${ROOT}/a b'` },
  { name: "after a separator", input: "x=/workspace/a:/workspace/b", root: ROOT, expected: `x=${ROOT}/a:${ROOT}/b` },
];

/** textToRoot: a path ending a sentence, and a name that goes on after a dot. */
export const AT_A_DOT: readonly RebaseCase[] = [
  {
    name: "a path that ends a sentence", input: "Work in /workspace. Then /workspace/a.ts.", root: ROOT,
    expected: `Work in ${ROOT}. Then ${ROOT}/a.ts.`,
  },
  { name: "a name that goes on after a dot", input: "not /workspace.old/a", root: ROOT, expected: "not /workspace.old/a" },
];

/** A brief naming paths in backticks and plain. */
export const BRIEF = "Read `/workspace/todo/prune/PRUNE-PLAN-F2.md`, then /workspace/src/a.ts.";
export const BRIEF_ON_ROOT = `Read \`${ROOT}/todo/prune/PRUNE-PLAN-F2.md\`, then ${ROOT}/src/a.ts.`;

/** A brief quoting /workspace as a constant of the code, in double and single quotes. */
export const QUOTED_BRIEF = 'Step 1: keep `const WORKING_DIRECTORY = "/workspace";` and \'/workspace/a\' as they are; edit /workspace/src/a.ts';
export const QUOTED_BRIEF_ON_ROOT = `Step 1: keep \`const WORKING_DIRECTORY = "/workspace";\` and '/workspace/a' as they are; edit ${ROOT}/src/a.ts`;

/** A brief with /workspace paths inside a ``` block and a ~~~ block, and outside them. */
export const FENCED_BRIEF = "Diff of /workspace/src/a.ts:\n```diff\n+ const root = /workspace/x;\n```\n~~~\n/workspace/y\n~~~\nThen /workspace/z";
export const FENCED_BRIEF_ON_ROOT = `Diff of ${ROOT}/src/a.ts:\n\`\`\`diff\n+ const root = /workspace/x;\n\`\`\`\n~~~\n/workspace/y\n~~~\nThen ${ROOT}/z`;

/** textFromRoot: the root and a path under it, and a look-alike kept. */
export const FROM_ROOT_TEXTS: readonly RebaseCase[] = [
  {
    name: "the root and a file under it", input: `${ROOT}\n${ROOT}/src/a.ts:3: error`, root: ROOT,
    expected: "/workspace\n/workspace/src/a.ts:3: error",
  },
  { name: "a sibling of the root, kept", input: `${ROOT}-F3/a`, root: ROOT, expected: `${ROOT}-F3/a` },
];

/** A value holding /workspace strings in a field, an array and a nested object, beside other values. */
export const VALUE = { path: "/workspace/a", n: 2, ops: [{ path: "/workspace/b" }, null], ok: true };
export const VALUE_ON_ROOT = { path: `${ROOT}/a`, n: 2, ops: [{ path: `${ROOT}/b` }, null], ok: true };
