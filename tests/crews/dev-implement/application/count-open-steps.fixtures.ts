// The checkout countOpenSteps reads: the work folder workbench/ holding the plan demo and its sheet of batch F1 (two
// steps with a TDD line, then a build step), over FakeFiles, FakeShell and a config store on the files.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

const DIR = `${WORKSPACE}/workbench/demo`;
export const SHEET_PATH = `${DIR}/DEMO-PLAN-F1.md`;

const STEP_TABLE = (name: string, id: string) =>
  ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|", `| 1 | \`${name}\` | unit | \`tests\` | ${id} |`, ""];
const OPEN = "TDD: RED [ ] GREEN [ ] COST [ ]";
const TICKED = "TDD: RED [x] GREEN [x] COST [x]";
const ANCHORS = [
  "## Anchors",
  "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
  "|------|----------------------|-----------------------------|------------------------------|",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 2 — Two | `tests/b.test.ts` — to create | — | `src/b.ts` — to create |",
  "| 3 — Build and tests | — | — | — |", "",
];

/** Steps 1 and 2 open, then the build step, which has no TDD line. */
export const SHEET = [
  "# DEMO-PLAN-F1 — Demo", "",
  "## TDD sequence",
  "### Step 1 — One", ...STEP_TABLE("does one", "BR-01"), OPEN, "",
  "### Step 2 — Two", ...STEP_TABLE("does two", "BR-02"), OPEN, "",
  "### Step 3 — Build and tests", "No test of its own.", "",
  ...ANCHORS,
].join("\n");

/** The sheet, step 1 done. */
export const STEP_1_DONE = SHEET.replace(OPEN, TICKED);

/** The sheet without its Anchors section: a format problem for each step with a TDD line. */
export const WITHOUT_ANCHORS = SHEET.slice(0, SHEET.indexOf("## Anchors"));

/** The checkout with the plan demo; its folder lists the sheet unless `sheet` is null. */
export function checkout(sheet: string | null = SHEET) {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["workbench"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(DIR, sheet === null ? ["DEMO-PLAN.md"] : ["DEMO-PLAN-F1.md", "DEMO-PLAN.md"]);
  if (sheet !== null) files.files.set(SHEET_PATH, sheet);
  const shell = new FakeShell();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  return { files, shell, config };
}

/** The checkout whose sheet is listed but cannot be read. */
export function unreadableSheet() {
  const deps = checkout();
  deps.files.readErrors.set(SHEET_PATH, new Error("permission denied"));
  return deps;
}

export interface CountCase { name: string; deps: () => ReturnType<typeof checkout>; plan: string | null; expected: number | undefined }

export const COUNT_CASES: readonly CountCase[] = [
  { name: "counts the steps whose TDD line has a box open", deps: () => checkout(), plan: "demo", expected: 2 },
  { name: "leaves out a step whose three boxes are ticked", deps: () => checkout(STEP_1_DONE), plan: "demo", expected: 1 },
  { name: "finds the sheet in the work folder when no plan is named", deps: () => checkout(), plan: null, expected: 2 },
  { name: "is undefined when no sheet of the batch is found", deps: () => checkout(null), plan: "demo", expected: undefined },
  { name: "is undefined when the sheet has a format problem", deps: () => checkout(WITHOUT_ANCHORS), plan: "demo", expected: undefined },
  { name: "is undefined when the sheet cannot be read", deps: unreadableSheet, plan: "demo", expected: undefined },
];
