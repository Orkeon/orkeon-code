// The fixture work folder tests/fixtures/dev/workbench/demo/ loaded into the fakes writeWorkflowState is tested over.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checkIgnoreCommand, ORKEON_IGNORE_PROBE } from "../dev/load-dev-context.ts";
import { createConfigStore } from "../config-store.ts";
import { WORKFLOW_ACTIVE_STATE_KEY } from "../../domain/session-keys.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

const DEMO_DIR = fileURLToPath(new URL("../../../../tests/fixtures/dev/workbench/demo/", import.meta.url));
export const STATE = `${WORKSPACE}/.orkeon/dev/demo/state-F2.md`;
export const AT = new Date("2026-10-24T10:00:00.123Z");
export const DEMO_F2 = `{"code":"demo","phase":"F2"}`;

/** The demo work folder, a git that ignores it and shows two changes, and a session holding `pointer` when given. */
export function workflowSetup(pointer: string | null) {
  const files = new FakeFiles();
  const names = readdirSync(DEMO_DIR).sort();
  for (const name of names) files.files.set(`${WORKSPACE}/workbench/demo/${name}`, readFileSync(DEMO_DIR + name, "utf-8"));
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(`${WORKSPACE}/workbench/demo`, names);
  const shell = new FakeShell();
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { exitCode: 0, stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results["git status --short"] = { exitCode: 0, stdout: " M src/a.ts\n?? notes.md\n" };
  const session = new FakeSessionStore();
  if (pointer !== null) session.state.set(WORKFLOW_ACTIVE_STATE_KEY, pointer);
  const config = createConfigStore({ files, session });
  return { files, shell, session, config, clock: () => AT };
}

export interface SkippedCase {
  pointer: string;
  skipped: string;
}

/** A done sheet, a batch without a sheet, an unknown code, and no open sheet for a batch without code. */
export const SKIPPED_POINTERS: readonly SkippedCase[] = [
  { pointer: `{"code":"demo","phase":"F1"}`, skipped: "workbench/demo/DEMO-PLAN-F1.md is done (2026-10-20)" },
  { pointer: `{"code":"demo","phase":"F7"}`, skipped: "no sheet of F7 in workbench/demo/" },
  { pointer: `{"code":"other","phase":"F2"}`, skipped: "no work code 'other' in workbench/ (absent)" },
  { pointer: `{"code":null,"phase":"F1"}`, skipped: "no open sheet of F1 in workbench/" },
];
