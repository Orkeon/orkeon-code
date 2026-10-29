// The world runDevPlan runs in for its tests: FakeFiles over the plan fixtures, FakeShell, FakeCodeIndex answering
// with the fixture inventory, a batch_anchors stub, FakeLlm and a fixed clock; the paths it writes, the answers and
// reviews the model gives, and the texts longer than a line it ends on.
import { readFileSync } from "node:fs";

import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import type { AnchorIndex } from "../../../../src/shared/application/ports.ts";
import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../../src/shared/application/dev/load-dev-context.ts";
import type { PlanAnswer } from "../../../../src/crews/dev-plan/domain/plan-answer.ts";
import type { Inventory } from "../../../../src/crews/dev-plan/domain/inventory-model.ts";
import { END_LINE, PLAN_JSON } from "../../../../src/crews/dev-plan/application/run-dev-plan.ts";
import type { DevPlanInputs } from "../../../../src/crews/dev-plan/application/run-dev-plan.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

const FIXTURES = new URL("../../../fixtures/dev/plan/", import.meta.url);
export const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

const W = `${WORKSPACE}/workbench`;
export const CODE = `${W}/prune`;
export const PLAN = `${CODE}/PRUNE-PLAN.md`;
export const F1 = `${CODE}/PRUNE-PLAN-F1.md`;
export const F2 = `${CODE}/PRUNE-PLAN-F2.md`;
export const PJ = `${CODE}/${PLAN_JSON}`;
export const ANSWER = json<PlanAnswer>("answer.json");
export const INVENTORY = json<Inventory>("inventory.json");
export const REVIEW_MAJOR = json<object>("review.json");
export const REVIEW_BLOCKING = json<object>("review-blocking.json");
export const CLEAR = { verdict: "CLEAR", rows: [] };
const ABSENT = "warning: commands.build_test, commands.test_project, commands.test_integration not in the pack: fill them " +
  "on the Commands line of PRUNE-PLAN.md § 1, or add them to .orkeon/repo.yaml and run /dev-plan prune --replace";

export const NEXT_LINE = END_LINE.replace("{command}", "/dev-batches workbench/prune/PRUNE-PLAN.md F1, or /dev-batches prune for every batch in their dependencies' order");

/** What a run that writes the plan and gets a CLEAR review ends on. */
export const CLEAR_SUMMARY = [
  "dev-plan: workbench/prune/PRUNE-PLAN.md — 2 batches, 4 ids traced (UC-01, BR-01, BR-02, BR-03)",
  "  F1 — Prune by age — 3 steps — BR-01, BR-02, BR-03 / UC-01 — depends on —",
  "  F2 — Command reference — 1 step — UC-01 — depends on F1",
  "files: workbench/prune/PRUNE-PLAN.md, PRUNE-PLAN-F1.md, PRUNE-PLAN-F2.md, plan.json",
  "inventory: 5 entries from 4 titles (index present, 16 calls)",
  "review: CLEAR",
  ABSENT,
  NEXT_LINE,
].join("\n");

export const MAJOR_LINES = "review: GAPS — 0 Blocking, 1 Major (F1: under ## Decisions)\n" +
  "  Major F1 — Does a prune with no cut-off refuse, or use a default age? (workbench/prune/SPEC-prune.md:31)";

export const BLOCKED_END = [
  "dev-plan: the plan is blocked: 1 Blocking question in workbench/prune/PRUNE-PLAN.md § 4; every batch reads — blocked.",
  "→ Answer it in the spec: /dev-spec prune, then /dev-plan prune --replace. Do not implement before.",
];

/** The golden renders: where the run writes each, and its expected file. */
export const GOLDEN: ReadonlyArray<[string, string]> = [[PLAN, "PRUNE-PLAN.md"], [F1, "PRUNE-PLAN-F1.md"], [F2, "PRUNE-PLAN-F2.md"]];

/** The index answers each title of SPEC-prune.md with the fixture inventory's symbols, I1..I5 in order. */
function indexOfFixture(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  const fqn = (ref: string) => `${WORKSPACE}/${INVENTORY.entries.find((e) => e.ref === ref)?.fqn}`;
  index.hits = {
    "Prune old memory entries": [{ fqn: fqn("I1"), score: 0.82, origin: "symbol" }],
    "An entry older than the cut-off is removed": [{ fqn: fqn("I2"), score: 0.77, origin: "symbol" }],
    "A feedback entry is never removed by a prune": [{ fqn: fqn("I3"), score: 0.61, origin: "text" }],
    "A dry run removes nothing": [{ fqn: fqn("I4"), score: 0.58, origin: "symbol" }, { fqn: fqn("I5"), score: 0.54, origin: "symbol" }],
  };
  for (const e of INVENTORY.entries) {
    index.sources[`${WORKSPACE}/${e.fqn}`] = {
      fqn: `${WORKSPACE}/${e.fqn}`, path: `${WORKSPACE}/${e.path}`, startLine: e.line, endLine: e.endLine,
      language: e.language, firstLine: e.firstLine,
    };
  }
  return index;
}

/** batch_anchors answers each fixture entry with its own member and its callers, the calls kept in order. */
function anchorsOfFixture(): AnchorIndex & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async closure(fqns) {
      calls.push(`closure ${fqns.join(" ")}`);
      const entry = INVENTORY.entries.find((e) => `${WORKSPACE}/${e.fqn}` === fqns[0]);
      const callers = (entry?.callers ?? []).map((c) => `${WORKSPACE}/${c}`);
      return { nodes: [`${fqns[0]}::member`, ...callers], unresolved: [], truncated: false };
    },
  };
}

/** The checkout with `source` in workbench/prune/, the model answering the golden plan then a CLEAR review. */
export function setup(source = "SPEC-prune.md") {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["workbench/", ".orkeon/", "src/", "docs/", "tests/"]);
  files.listings.set(W, ["prune/"]);
  files.listings.set(CODE, [source]);
  files.listings.set(`${WORKSPACE}/src/shared/domain`, ["memory.ts"]);
  files.listings.set(`${WORKSPACE}/docs`, ["commands.md", "fr/"]);
  files.listings.set(`${WORKSPACE}/docs/fr`, ["commands.md"]);
  files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, fixture("pack.yaml"));
  files.files.set(`${CODE}/${source}`, fixture(source === "SPEC-prune.md" ? "SPEC-prune.md" : "CHANGE-cache.md"));
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { stdout: ".orkeon/config.json\n" };
  const llm = new FakeLlm();
  llm.extractions = [ANSWER, CLEAR];
  llm.answers = ["CLEAR: nothing to ask."];
  const index = indexOfFixture();
  const log = new FakeLogger();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const anchors = anchorsOfFixture();
  const deps = { files, shell, llm, config, index, anchors, log, clock: () => new Date(2026, 9, 22, 14, 5) };
  return { files, shell, llm, index, anchors, log, deps };
}
export type Setup = ReturnType<typeof setup>;

/** The paths written, in order. */
export const written = (f: Setup): string[] => f.files.writes.map((w) => w.path);

/** The checkout holding the golden plan and its two sheets, as written before. */
export function withGoldenPlan(f: Setup, sheetF1 = fixture("expected/PRUNE-PLAN-F1.md")): void {
  f.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]);
  f.files.files.set(PLAN, fixture("expected/PRUNE-PLAN.md"));
  f.files.files.set(F1, sheetF1);
  f.files.files.set(F2, fixture("expected/PRUNE-PLAN-F2.md"));
}

/** The checkout holding an old plan of three batches. */
export function withThreeBatchPlan(f: Setup): void {
  const names = ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md"];
  f.files.listings.set(CODE, ["SPEC-prune.md", ...names]);
  for (const n of names) f.files.files.set(`${CODE}/${n}`, n === "PRUNE-PLAN.md" ? "# PRUNE-PLAN — old\n" : `# ${n.slice(0, -3)} — old\n`);
}

/** Inputs or a checkout runDevPlan refuses before the model, and the line it answers. */
export interface RefusalCase {
  name: string;
  input: DevPlanInputs;
  arrange: (f: Setup) => void;
  text: string;
}

export const REFUSALS: readonly RefusalCase[] = [
  { name: "refuses a source that is not a string", input: { source: 3 }, arrange: () => undefined, text: "dev-plan: invalid crew input: source" },
  { name: "refuses a replace that is not a boolean", input: { source: "prune", replace: "yes" }, arrange: () => undefined, text: "dev-plan: invalid crew input: replace" },
  {
    name: "refuses another checkout", input: { source: "prune" },
    arrange: (f) => { f.shell.results[GIT_TOPLEVEL] = { stdout: "/elsewhere\n" }; },
    text: `dev-plan: run from the checkout at ${WORKSPACE} (git reports /elsewhere)`,
  },
  {
    name: "refuses a source with no id", input: { source: "prune" },
    arrange: (f) => { f.files.files.set(`${CODE}/SPEC-prune.md`, "# prune — Prune\n\n## 1. Context\n\nNothing yet.\n"); },
    text: "dev-plan: workbench/prune/SPEC-prune.md names no UC-, BR- or CH- id: nothing to trace",
  },
];

export const STARTED_PLAN_TEXT = "dev-plan: workbench/prune/PRUNE-PLAN-F1.md records work done (the TDD line of step 1 is ticked): " +
  "a started plan is never replaced; plan the rest as a new change";

export const FEWER_BATCHES_TEXT = "dev-plan: the new plan has 2 batches and the previous one 3; Orkeon Code cannot delete a file: " +
  "remove workbench/prune/PRUNE-PLAN-F3.md by hand, then /dev-plan prune --replace. Nothing is written.";

/** An answer reusing 14 refs the inventory does not show. */
export const FOURTEEN_UNKNOWN_REUSE = { ...ANSWER, reuse: Array.from({ length: 14 }, (_, i) => `I${i + 10}`) };
