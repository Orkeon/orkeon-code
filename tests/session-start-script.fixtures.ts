// The trees scripts/session-start.sh and scripts/session-start.ork.ts are run over, and what they print.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderStateFile } from "../src/shared/domain/workflow/state-file.ts";
import { WORKSPACE } from "../src/shared/domain/dev/path-rebase.ts";

export const SCRIPT = fileURLToPath(new URL("../scripts/session-start.sh", import.meta.url));

export interface ShResult { status: number | null; stdout: string }

/** Runs session-start.sh over a scratch tree of `files`, those of `old` dated ten days back, then removes the tree. */
export function runOver(files: Record<string, string>, old: readonly string[] = []): ShResult {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    for (const path of old) utimesSync(join(root, path), tenDaysAgo, tenDaysAgo);
    const r = spawnSync("sh", [SCRIPT, root], { encoding: "utf-8" });
    return { status: r.status, stdout: r.stdout };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Dated now: the script keeps a state file its header dates in the last 7 days.
export const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
export const STATE = renderStateFile({
  code: "demo", phase: "F2", at: NOW, trigger: "auto", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: [{ label: "Step 2 — Refuse a code", tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }],
  events: [], reports: [], tree: { lines: [] },
});

/** The lines a session gets for the state file of demo F2 written at `at`, then the open batch F2 of `code`'s log. */
export function inProgress(at: string, code: string): string {
  return "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):\n" +
    `- state of a batch: .orkeon/dev/demo/state-F2.md (written ${at}); first open step: Step 2 — Refuse a code. ` +
    "Read it before going on with that batch.\n" +
    `- open batch(es) in .orkeon/dev/${code}/batches-state.md: F2 (/dev-batches ${code} goes on)`;
}

export const NOTHING_IN_PROGRESS: readonly { name: string; files: Record<string, string> }[] = [
  { name: "prints nothing without Code's dev state", files: { "README.md": "x" } },
  {
    name: "prints nothing with nothing in progress",
    files: {
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:00 F1 merged abc\n- 2026-10-21 09:10 closed\n",
    },
  },
];

/** State files whose file is ten days old, kept as the twin keeps them, with the line naming them. */
export const KEPT_STATE_FILES: readonly { name: string; path: string; text: string; line: string }[] = [
  {
    name: "picks a state file by the header's date, never the file's age",
    path: ".orkeon/dev/demo/state-F2.md",
    text: STATE,
    line: "- state of a batch: .orkeon/dev/demo/state-F2.md",
  },
  {
    name: "keeps a state file its header does not date",
    path: ".orkeon/dev/demo/state-F3.md",
    text: STATE.replace(/written at \S+/, "written at yesterday"),
    line: "- state of a batch: .orkeon/dev/demo/state-F3.md (written yesterday)",
  },
];

// scripts/session-start.ork.ts, the one the launcher installs: the same lines through the file tools.
const ORK = new URL("../scripts/session-start.ork.ts", import.meta.url).href;
let runs = 0;

/** Runs the script once over these files (paths under /workspace), returning what it printed. */
export async function runOrk(files: Record<string, string>, options: { globFails?: boolean } = {}): Promise<string> {
  const printed: string[] = [];
  const g = globalThis as { tools?: unknown };
  const log = console.log;
  g.tools = {
    glob: async ({ path, pattern }: { path: string; pattern: string }) => {
      if (options.globFails) throw new Error(`no such directory: ${path}`);
      const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
      return { paths: Object.keys(files).filter((f) => f.startsWith(`${path}/`) && re.test(f.slice(path.length + 1))), truncated: false };
    },
    fileRead: async ({ path }: { path: string }) => ({ content: files[path] ?? "" }),
  };
  console.log = (...args: unknown[]) => { printed.push(args.join(" ")); };
  try {
    await import(`${ORK}?run=${++runs}`);
  } finally {
    console.log = log;
    delete g.tools;
  }
  return printed.join("\n");
}

export const RECENT = renderStateFile({
  code: "demo", phase: "F2", at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), trigger: "auto", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: [{ label: "Step 2 — Refuse a code", tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }],
  events: [], reports: [], tree: { lines: [] },
});
export const OLD = RECENT.replace(/written at \S+/, "written at 2020-01-01T00:00:00Z");

export const ORK_NOTHING_IN_PROGRESS: readonly { name: string; files: Record<string, string>; globFails?: boolean }[] = [
  { name: "prints nothing without Code's dev state", files: {}, globFails: true },
  {
    name: "prints nothing with nothing in progress",
    files: {
      [`${WORKSPACE}/.orkeon/dev/demo/batches-state.md`]: "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:10 closed\n",
      [`${WORKSPACE}/.orkeon/dev/demo/state-F2.md`]: OLD,
    },
  },
];
