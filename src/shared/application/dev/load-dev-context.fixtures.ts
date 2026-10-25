// The checkout, the git answers and the fixture work folder the dev context is loaded from. The code cases load
// tests/fixtures/dev/workbench/demo/.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { HARNESS_SETTINGS_LOCAL, HARNESS_TODO, ORKEON_IGNORE_PROBE, checkIgnoreCommand, loadDevContext } from "./load-dev-context.ts";
import { createConfigStore } from "../config-store.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
export const CONFIG = `${WORKSPACE}/.orkeon/config.json`;
/** The ignore check of both probes, and of the config probe alone. */
export const BOTH = checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"]);
export const PROBE_ONLY = checkIgnoreCommand([ORKEON_IGNORE_PROBE]);
/** Git ignoring both probes. */
export const IGNORED = { exitCode: 0, stdout: ".orkeon/config.json\nworkbench/\n" };
export const NOT_IGNORED = (p: string) => `${p} is not ignored by git: add it to .gitignore (Orkeon Code never edits it)`;
export const TODO_WARNING =
  "todo/ holds harness artefacts and nothing names workbench/: set layout.work: workbench in the pack, " +
  "or HARNESS_WORK_DIR=workbench in .claude/settings.local.json env (W-01)";

/** Empty files, a shell answering nothing, and a config store on the files. */
export function setup() {
  const files = new FakeFiles();
  const shell = new FakeShell();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  return { files, shell, config };
}

/** setup() with dev.workDir set to notes, the folder there, git ignoring the config probe. */
export function namedNotes() {
  const deps = setup();
  deps.files.files.set(CONFIG, JSON.stringify({ "dev.workDir": "notes" }));
  deps.files.listings.set(WORKSPACE, ["notes"]);
  deps.shell.results[PROBE_ONLY] = { exitCode: 0, stdout: ".orkeon/config.json\n" };
  return deps;
}

/** setup(), git ignoring both probes, todo/ holding the harness folders `names`. */
export function todoHolding(names: string[]) {
  const deps = setup();
  deps.shell.results[BOTH] = IGNORED;
  deps.files.listings.set(HARNESS_TODO, names);
  return deps;
}

/** todoHolding(["pr-x"]) with the harness settings `settings`. */
export function todoWithSettings(settings: string, names = ["pr-x"]) {
  const deps = todoHolding(names);
  deps.files.files.set(HARNESS_SETTINGS_LOCAL, settings);
  return deps;
}

/** The demo fixture folder at /workspace/workbench/demo, plus any extra file names. */
function loadDemo(files: FakeFiles, extra: Record<string, string> = {}): void {
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`${WORKSPACE}/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  for (const [name, text] of Object.entries(extra)) files.files.set(`${WORKSPACE}/workbench/demo/${name}`, text);
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(`${WORKSPACE}/workbench/demo`, [...names, ...Object.keys(extra)]);
}

/** The files holding the demo folder (and the `extra` files in it), and the work folder the context resolves. */
export async function demoContext(extra: Record<string, string> = {}) {
  const { files, shell, config } = setup();
  loadDemo(files, extra);
  const ctx = await loadDevContext({ files, shell, config });
  return { files, work: ctx.work };
}

/** A view of `files` that lists through them and records in `reads` every path read. */
export function readSpy(files: FakeFiles, reads: string[]) {
  return { list: files.list.bind(files), read: async (p: string) => { reads.push(p); return files.read(p); } };
}

/**
 * Lists in the work folder 60 loose files, a README, 54 code folders c00…c53 (in reverse order) each holding a spec,
 * and demo/. Returns the code folders in the order listed.
 */
export function manyCodes(files: FakeFiles): string[] {
  const loose = Array.from({ length: 60 }, (_, i) => `note-${String(i).padStart(2, "0")}.md`);
  const folders = Array.from({ length: 54 }, (_, i) => `c${String(i).padStart(2, "0")}`).reverse();
  files.listings.set(`${WORKSPACE}/workbench`, [...loose, "README.md", ...folders, "demo/"]);
  for (const f of folders) files.listings.set(`${WORKSPACE}/workbench/${f}`, [`SPEC-${f}.md`]);
  return folders;
}

export const DEMO_SHEETS = [["F1", "DEMO-PLAN-F1.md"], ["F2", "DEMO-PLAN-F2.md"], ["F3", "DEMO-PLAN-F3.md"]];

export const LISTED_CODES = [
  { code: "demo", spec: true, change: false, plan: true, sheets: 3, verdicts: 2 },
  { code: "fix-x", spec: false, change: true, plan: false, sheets: 0, verdicts: 0 },
];
