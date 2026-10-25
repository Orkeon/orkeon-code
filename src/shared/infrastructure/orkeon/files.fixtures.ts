// The working root and the calls the createFiles tests make under it.
import type { createFiles } from "./files.ts";
import { WORKSPACE } from "../../domain/dev/path-rebase.ts";

type Files = ReturnType<typeof createFiles>;

export const ROOT = `${WORKSPACE}/.orkeon/worktrees/prune-F2`;

export interface ContentCase {
  name: string;
  reply: unknown;
  expected: string;
}

/** file_read replies in the other shapes the tool emits. */
export const OTHER_CONTENTS: readonly ContentCase[] = [
  { name: "reads `Content` (PascalCase)", reply: { Content: "pascal" }, expected: "pascal" },
  { name: "reads `text`", reply: { text: "plain" }, expected: "plain" },
];

export interface RootedCase {
  name: string;
  call: (files: Files) => Promise<unknown>;
  /** The path the tool receives. */
  path: string;
}

/** A /workspace path moves under the root; a path already there, or outside /workspace, is kept. */
export const ROOTED_CALLS: readonly RootedCase[] = [
  { name: `reads a ${WORKSPACE} path under the root`, call: (files) => files.read(`${WORKSPACE}/src/a.ts`), path: `${ROOT}/src/a.ts` },
  {
    name: `writes a ${WORKSPACE} path under the root`,
    call: (files) => files.write(`${WORKSPACE}/.orkeon/dev/prune/implement-F2.json`, "{}"),
    path: `${ROOT}/.orkeon/dev/prune/implement-F2.json`,
  },
  { name: `lists a ${WORKSPACE} path under the root`, call: (files) => files.list(`${WORKSPACE}/workbench/prune`, 10), path: `${ROOT}/workbench/prune` },
  { name: "keeps a path already under the root", call: (files) => files.read(`${ROOT}/src/b.ts`), path: `${ROOT}/src/b.ts` },
  { name: `keeps a path outside ${WORKSPACE}`, call: (files) => files.read("/output/jobs/1.log"), path: "/output/jobs/1.log" },
];
