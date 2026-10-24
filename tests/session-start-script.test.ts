// scripts/session-start.sh over fixture trees: the lines a new session gets about the dev
// work left in progress. Run:
//   node --test tests/session-start-script.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderStateFile } from "../src/shared/domain/workflow/state-file.ts";

const SCRIPT = fileURLToPath(new URL("../scripts/session-start.sh", import.meta.url));

function withTree(files: Record<string, string>, check: (root: string) => void, old: string[] = []): void {
  const root = mkdtempSync(join(tmpdir(), "session-start-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    for (const path of old) utimesSync(join(root, path), tenDaysAgo, tenDaysAgo);
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root: string) => spawnSync("sh", [SCRIPT, root], { encoding: "utf-8" });

// Dated now: the script keeps a state file its header dates in the last 7 days.
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const STATE = renderStateFile({
  code: "demo", phase: "F2", at: NOW, trigger: "auto", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: [{ label: "Step 2 — Refuse a code", tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }],
  events: [], reports: [], tree: { lines: [] },
});

describe("scripts/session-start.sh", () => {
  it("parses as POSIX sh", () => {
    strictEqual(spawnSync("sh", ["-n", SCRIPT]).status, 0);
  });

  it("prints nothing without Code's dev state, or with nothing in progress", () => {
    withTree({ "README.md": "x" }, (root) => strictEqual(run(root).stdout, ""));
    withTree({
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:00 F1 merged abc\n- 2026-10-21 09:10 closed\n",
    }, (root) => strictEqual(run(root).stdout, ""));
  });

  it("names a recent state file with its date and first open step, and the open batches of a log", () => {
    withTree({
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/demo/batches-state.md": "# log\n- 2026-10-21 08:30 F1 launched\n- 2026-10-21 08:31 F2 relaunched\n- 2026-10-21 09:00 F1 returned VALID\n",
    }, (root) => {
      const r = run(root);
      strictEqual(r.status, 0);
      strictEqual(r.stdout,
        "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):\n" +
        `- state of a batch: .orkeon/dev/demo/state-F2.md (written ${NOW}); first open step: Step 2 — Refuse a code. ` +
        "Read it before going on with that batch.\n" +
        "- open batch(es) in .orkeon/dev/demo/batches-state.md: F2 (/dev-batches demo goes on)\n");
    });
  });

  it("leaves out a state file its header dates more than 7 days back, and a batch a later `closed` closes", () => {
    withTree({
      ".orkeon/dev/demo/state-F2.md": STATE.replace(/written at \S+/, "written at 2020-01-01T00:00:00Z"),
      ".orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:10 closed\n",
    }, (root) => strictEqual(run(root).stdout, ""));
  });

  it("picks state files as its twin does: by the header's date, never the file's age; undated, kept", () => {
    withTree({ ".orkeon/dev/demo/state-F2.md": STATE }, (root) => {
      strictEqual(run(root).stdout.includes("- state of a batch: .orkeon/dev/demo/state-F2.md"), true);
    }, [".orkeon/dev/demo/state-F2.md"]);
    withTree({ ".orkeon/dev/demo/state-F3.md": STATE.replace(/written at \S+/, "written at yesterday") }, (root) => {
      strictEqual(run(root).stdout.includes("- state of a batch: .orkeon/dev/demo/state-F3.md (written yesterday)"), true);
    }, [".orkeon/dev/demo/state-F3.md"]);
  });

  it("reads a log written with CRLF line ends, and prints its header once", () => {
    withTree({
      ".orkeon/dev/demo/state-F2.md": STATE,
      ".orkeon/dev/other/batches-state.md": "- 2026-10-21 08:30 F4 launched\r\n",
    }, (root) => {
      const out = run(root).stdout;
      strictEqual(out.split("Dev work in progress").length, 2, out);
      strictEqual(out.endsWith("- open batch(es) in .orkeon/dev/other/batches-state.md: F4 (/dev-batches other goes on)\n"), true, out);
    });
  });
});

// scripts/session-start.ork.ts, the one the launcher installs: the same lines through the file tools.
const ORK = new URL("../scripts/session-start.ork.ts", import.meta.url).href;
let runs = 0;

/** Runs the script once over these files (paths under /workspace), returning what it printed. */
async function runOrk(files: Record<string, string>, options: { globFails?: boolean } = {}): Promise<string> {
  const printed: string[] = [];
  const g = globalThis as { tools?: unknown };
  const log = console.log;
  g.tools = {
    glob: async ({ path, pattern }: { path: string; pattern: string }) => {
      if (options.globFails) throw new Error(`no such directory: ${path}`);
      const re = new RegExp(`^${pattern.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]*")}$`);
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

const RECENT = renderStateFile({
  code: "demo", phase: "F2", at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), trigger: "auto", sheet: "workbench/demo/DEMO-PLAN-F2.md",
  steps: [{ label: "Step 2 — Refuse a code", tdd: "RED [ ] GREEN [ ] COST [ ]", open: true }],
  events: [], reports: [], tree: { lines: [] },
});
const OLD = RECENT.replace(/written at \S+/, "written at 2020-01-01T00:00:00Z");

describe("scripts/session-start.ork.ts", () => {
  it("prints nothing without Code's dev state, or with nothing in progress", async () => {
    strictEqual(await runOrk({}, { globFails: true }), "");
    strictEqual(await runOrk({
      "/workspace/.orkeon/dev/demo/batches-state.md": "- 2026-10-21 08:30 F1 launched\n- 2026-10-21 09:10 closed\n",
      "/workspace/.orkeon/dev/demo/state-F2.md": OLD,
    }), "");
  });

  it("names a recent state file with its date and first open step, and the open batches of a CRLF log", async () => {
    const at = /written at (\S+)/.exec(RECENT)![1];
    strictEqual(await runOrk({
      "/workspace/.orkeon/dev/demo/state-F2.md": RECENT,
      "/workspace/.orkeon/dev/other/batches-state.md": "# log\r\n- 2026-10-21 08:30 F1 launched\r\n- 2026-10-21 08:31 F2 relaunched\r\n- 2026-10-21 09:00 F1 returned VALID\r\n",
    }),
      "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):\n" +
      `- state of a batch: .orkeon/dev/demo/state-F2.md (written ${at}); first open step: Step 2 — Refuse a code. ` +
      "Read it before going on with that batch.\n" +
      "- open batch(es) in .orkeon/dev/other/batches-state.md: F2 (/dev-batches other goes on)");
  });
});
