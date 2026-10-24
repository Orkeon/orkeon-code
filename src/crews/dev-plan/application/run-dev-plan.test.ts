// runDevPlan over FakeFiles (the plan fixtures), FakeShell, FakeCodeIndex, a batch_anchors stub, FakeLlm and a
// fixed clock: the plan written then rewritten after the review, the golden renders, the
// blocked plan, the refusals before any model call, the re-ask, the replace rules, the
// review that fails, the warnings, and no write under .claude/ nor outside the code
// folder in any case. Run:
//   node --test src/crews/dev-plan/application/run-dev-plan.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { FakeCodeIndex } from "../../../../tests/support/fake-code-index.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import type { AnchorIndex } from "../../../shared/application/ports.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import type { PlanAnswer } from "../domain/plan-answer.ts";
import type { Inventory } from "../domain/inventory-model.ts";
import { END_LINE, PLAN_JSON, runDevPlan } from "./run-dev-plan.ts";
import type { DevPlanInputs } from "./run-dev-plan.ts";

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

const W = "/workspace/workbench";
const CODE = `${W}/prune`;
const PLAN = `${CODE}/PRUNE-PLAN.md`;
const F1 = `${CODE}/PRUNE-PLAN-F1.md`;
const F2 = `${CODE}/PRUNE-PLAN-F2.md`;
const PJ = `${CODE}/${PLAN_JSON}`;
const ANSWER = json<PlanAnswer>("answer.json");
const INVENTORY = json<Inventory>("inventory.json");
const REVIEW_MAJOR = json<object>("review.json");
const REVIEW_BLOCKING = json<object>("review-blocking.json");
const CLEAR = { verdict: "CLEAR", rows: [] };
const ABSENT = "warning: commands.build_test, commands.test_project, commands.test_integration not in the pack: fill them " +
  "on the Commands line of PRUNE-PLAN.md § 1, or add them to .orkeon/repo.yaml and run /dev-plan prune --replace";

/** The index answers each title of SPEC-prune.md with the fixture inventory's symbols, I1..I5 in order. */
function indexOfFixture(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  const fqn = (ref: string) => `/workspace/${INVENTORY.entries.find((e) => e.ref === ref)?.fqn}`;
  index.hits = {
    "Prune old memory entries": [{ fqn: fqn("I1"), score: 0.82, origin: "symbol" }],
    "An entry older than the cut-off is removed": [{ fqn: fqn("I2"), score: 0.77, origin: "symbol" }],
    "A feedback entry is never removed by a prune": [{ fqn: fqn("I3"), score: 0.61, origin: "text" }],
    "A dry run removes nothing": [{ fqn: fqn("I4"), score: 0.58, origin: "symbol" }, { fqn: fqn("I5"), score: 0.54, origin: "symbol" }],
  };
  for (const e of INVENTORY.entries) {
    index.sources[`/workspace/${e.fqn}`] = {
      fqn: `/workspace/${e.fqn}`, path: `/workspace/${e.path}`, startLine: e.line, endLine: e.endLine,
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
      const entry = INVENTORY.entries.find((e) => `/workspace/${e.fqn}` === fqns[0]);
      const callers = (entry?.callers ?? []).map((c) => `/workspace/${c}`);
      return { nodes: [`${fqns[0]}::member`, ...callers], unresolved: [], truncated: false };
    },
  };
}

function setup(source = "SPEC-prune.md") {
  const files = new FakeFiles();
  files.listings.set("/workspace", ["workbench/", ".orkeon/", "src/", "docs/", "tests/"]);
  files.listings.set(W, ["prune/"]);
  files.listings.set(CODE, [source]);
  files.listings.set("/workspace/src/shared/domain", ["memory.ts"]);
  files.listings.set("/workspace/docs", ["commands.md", "fr/"]);
  files.listings.set("/workspace/docs/fr", ["commands.md"]);
  files.files.set("/workspace/.orkeon/repo.yaml", fixture("pack.yaml"));
  files.files.set(`${CODE}/${source}`, fixture(source === "SPEC-prune.md" ? "SPEC-prune.md" : "CHANGE-cache.md"));
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
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
type Setup = ReturnType<typeof setup>;
const run = (f: Setup, input: DevPlanInputs = { source: "prune" }) => runDevPlan(input, f.deps);

const written = (f: Setup): string[] => f.files.writes.map((w) => w.path);
/** Every case: nothing under .claude/, nothing outside the code folder. */
function guarded(f: Setup): void {
  for (const w of f.files.writes) {
    ok(!w.path.startsWith("/workspace/.claude/"), w.path);
    ok(w.path.startsWith(`${CODE}/`), w.path);
  }
}

describe("runDevPlan — a plan written and reviewed", () => {
  it("writes the plan, its sheets and plan.json, and ends on the next command (review CLEAR)", async () => {
    const f = setup();
    const text = await run(f);
    guarded(f);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ, PJ]);
    strictEqual(f.llm.extracts.length, 2);
    strictEqual(f.llm.acts.length, 1);
    strictEqual(f.llm.acts[0].request.permissionMode, "plan");
    strictEqual(f.anchors.calls.length, 5);
    strictEqual(text, [
      "dev-plan: workbench/prune/PRUNE-PLAN.md — 2 batches, 4 ids traced (UC-01, BR-01, BR-02, BR-03)",
      "  F1 — Prune by age — 3 steps — BR-01, BR-02, BR-03 / UC-01 — depends on —",
      "  F2 — Command reference — 1 step — UC-01 — depends on F1",
      "files: workbench/prune/PRUNE-PLAN.md, PRUNE-PLAN-F1.md, PRUNE-PLAN-F2.md, plan.json",
      "inventory: 5 entries from 4 titles (index present, 16 calls)",
      "review: CLEAR",
      ABSENT,
      END_LINE.replace("{command}", "/dev-implement F1 workbench/prune/PRUNE-PLAN.md"),
    ].join("\n"));
    const pj = JSON.parse(f.files.files.get(PJ) ?? "{}");
    deepStrictEqual([pj.version, pj.source, pj.prefix, pj.review], [1, "workbench/prune/SPEC-prune.md", "PRUNE", CLEAR]);
    deepStrictEqual(pj.inventory.entries.map((e: { ref: string; path: string; line: number }) => [e.ref, e.path, e.line]),
      INVENTORY.entries.map((e) => [e.ref, e.path, e.line]));
    deepStrictEqual(pj.answer, ANSWER);
  });

  it("puts a Major row under F1's ## Decisions: the golden renders, F1 and plan.json rewritten", async () => {
    const f = setup();
    f.llm.extractions = [ANSWER, REVIEW_MAJOR];
    const text = await run(f);
    guarded(f);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ, F1, PJ]);
    for (const [path, name] of [[PLAN, "PRUNE-PLAN.md"], [F1, "PRUNE-PLAN-F1.md"], [F2, "PRUNE-PLAN-F2.md"]]) {
      strictEqual(f.files.files.get(path), fixture(`expected/${name}`), name);
    }
    ok(text.includes("review: GAPS — 0 Blocking, 1 Major (F1: under ## Decisions)\n" +
      "  Major F1 — Does a prune with no cut-off refuse, or use a default age? (workbench/prune/SPEC-prune.md:31)"), text);
    ok(text.endsWith(END_LINE.replace("{command}", "/dev-implement F1 workbench/prune/PRUNE-PLAN.md")));
    deepStrictEqual(JSON.parse(f.files.files.get(PJ) ?? "{}").review, REVIEW_MAJOR);
  });

  it("blocks every batch on a Blocking row and points back to the spec", async () => {
    const f = setup();
    f.llm.extractions = [ANSWER, REVIEW_BLOCKING];
    const text = await run(f);
    guarded(f);
    const plan = f.files.files.get(PLAN) ?? "";
    ok(plan.includes("### Batch F1 — Prune by age — blocked") && plan.includes("### Batch F2 — Command reference — blocked"));
    ok(plan.includes("## 4. Open questions"));
    ok((f.files.files.get(F1) ?? "").includes("## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)"));
    const lines = text.split("\n");
    deepStrictEqual(lines.slice(-2), [
      "dev-plan: the plan is blocked: 1 Blocking question in workbench/prune/PRUNE-PLAN.md § 4; every batch reads — blocked.",
      "→ Answer it in the spec: /dev-spec prune, then /dev-plan prune --replace. Do not implement before.",
    ]);
    ok(!text.includes("/dev-implement"));
  });

  it("keeps the files and says the review did not run when the reviewer fails", async () => {
    const f = setup();
    f.llm.answers = [new Error("provider down\nstack")];
    const text = await run(f);
    guarded(f);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ]);
    ok(text.includes("\nreview: not run (model-failed: provider down)\n"), text);
    ok(text.endsWith("→ The plan is written but unreviewed: read it closely before implementing, or /dev-plan prune --replace to plan and review again."));
  });

  it("warns when the host's permission gate is off, and still reviews", async () => {
    const f = setup();
    f.llm.gateEnabled = false;
    const text = await run(f);
    ok(text.includes("warning: the host's permission gate is off; the reviewer was offered read tools only"));
    strictEqual(f.llm.acts.length, 1);
    const quiet = setup();
    quiet.llm.gateEnabled = undefined;
    ok(!(await run(quiet)).includes("permission gate"));
  });

  it("offers the reviewer the plan files, the source, the inventory and the targets", async () => {
    const f = setup();
    await run(f);
    const brief = f.llm.acts[0].prompt;
    ok(brief.includes("mode: plan workbench/prune/"));
    ok(brief.includes("- workbench/prune/PRUNE-PLAN.md\n- workbench/prune/PRUNE-PLAN-F1.md\n- workbench/prune/PRUNE-PLAN-F2.md"));
    ok(brief.includes("Source it was planned from: workbench/prune/SPEC-prune.md"));
    ok(brief.includes("I1 · src/shared/domain/memory.ts:18"));
    ok(brief.includes("A row targets one of: plan, F1, F2."));
  });
});

describe("runDevPlan — the planner's answer", () => {
  it("asks once more with the problems of a refused answer, then writes", async () => {
    const f = setup();
    const bad = { ...ANSWER, reuse: ["I9"] };
    f.llm.extractions = [bad, ANSWER, CLEAR];
    await run(f);
    strictEqual(f.llm.extracts.length, 3);
    const second = f.llm.extracts[1].prompt;
    const asked = second.indexOf("Your previous answer was refused; fix each of these:\n- reuse: I9 is not an inventory entry shown");
    ok(asked > 0 && asked < second.indexOf("Source (spec)"), "the problems come before the material");
    ok(written(f).includes(PLAN));
    guarded(f);
  });

  it("asks once more when an existing anchor is absent or a create anchor is present", async () => {
    const f = setup();
    f.files.listings.set("/workspace/docs/fr", []);
    f.files.listings.set("/workspace/src/shared/domain", ["memory.ts", "memory-prune.ts"]);
    f.llm.extractions = [ANSWER, ANSWER];
    const text = await run(f);
    strictEqual(f.llm.extracts.length, 2);
    const second = f.llm.extracts[1].prompt;
    ok(second.includes("- B2 S1: docs/fr/commands.md does not exist"));
    ok(second.includes("- B1 S1: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref"));
    ok(text.startsWith("dev-plan: the plan was refused twice; nothing is written.\n  B1 S1: "), text);
    deepStrictEqual(written(f), []);
  });

  it("lists each anchor folder once for the run, though both attempts check the anchors", async () => {
    const f = setup();
    f.files.listings.set("/workspace/docs/fr", []);
    f.llm.extractions = [ANSWER, ANSWER];
    const listed: string[] = [];
    const list = f.files.list.bind(f.files);
    f.files.list = async (path: string, max: number) => { listed.push(path); return list(path, max); };
    await run(f);
    strictEqual(f.llm.extracts.length, 2);
    ok(f.llm.extracts[1].prompt.includes("- B2 S1: docs/fr/commands.md does not exist"));
    for (const folder of ["/workspace/src/shared/domain", "/workspace/docs", "/workspace/docs/fr"]) {
      strictEqual(listed.filter((p) => p === folder).length, 1, folder);
    }
  });

  it("writes nothing after two refusals, and lists 12 problems then the count", async () => {
    const f = setup();
    const bad = { ...ANSWER, reuse: Array.from({ length: 14 }, (_, i) => `I${i + 10}`) };
    f.llm.extractions = [new Error("not JSON"), bad];
    const text = await run(f);
    deepStrictEqual(written(f), []);
    strictEqual(f.llm.acts.length, 0);
    ok(f.llm.extracts[1].prompt.includes("- the answer did not parse: not JSON"));
    const lines = text.split("\n");
    strictEqual(lines[0], "dev-plan: the plan was refused twice; nothing is written.");
    strictEqual(lines.length, 14);
    strictEqual(lines[13], "  … 2 more");
  });
});

describe("runDevPlan — refusals before the model", () => {
  it("stops on a Blocking open question: no inventory, no extract, no write", async () => {
    const f = setup("SPEC-blocked.md");
    f.files.listings.set(CODE, ["SPEC-prune.md"]);
    f.files.files.set(`${CODE}/SPEC-prune.md`, fixture("SPEC-blocked.md"));
    const text = await run(f);
    ok(text.startsWith("dev-plan: workbench/prune/SPEC-prune.md has 4 open Blocking question(s); no plan is written."), text);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.index.calls, []);
    deepStrictEqual(written(f), []);
  });

  it("refuses an existing plan without --replace", async () => {
    const f = setup();
    f.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md", "PRUNE-PLAN-F1.md"]);
    const text = await run(f);
    strictEqual(text, "dev-plan: workbench/prune/PRUNE-PLAN.md exists: /dev-plan prune --replace writes a new plan over it (nothing is merged)");
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(written(f), []);
  });

  it("never replaces a plan whose work has started", async () => {
    const f = setup();
    f.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]);
    f.files.files.set(PLAN, fixture("expected/PRUNE-PLAN.md"));
    f.files.files.set(F1, fixture("expected/PRUNE-PLAN-F1.md").replace("TDD: RED [ ] GREEN [ ]", "TDD: RED [x] GREEN [ ]"));
    f.files.files.set(F2, fixture("expected/PRUNE-PLAN-F2.md"));
    const text = await run(f, { source: "prune", replace: true });
    strictEqual(text, "dev-plan: workbench/prune/PRUNE-PLAN-F1.md records work done (the TDD line of step 1 is ticked): " +
      "a started plan is never replaced; plan the rest as a new change");
    deepStrictEqual(written(f), []);
    const boxed = setup();
    boxed.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md"]);
    boxed.files.files.set(PLAN, fixture("expected/PRUNE-PLAN.md").replace("- [ ] 1. An entry", "- [x] 1. An entry"));
    ok((await run(boxed, { source: "prune", replace: true })).includes("records work done (step 1 of F1 is ticked)"));
  });

  it("replaces an untouched plan with --replace", async () => {
    const f = setup();
    f.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]);
    f.files.files.set(PLAN, fixture("expected/PRUNE-PLAN.md"));
    f.files.files.set(F1, fixture("expected/PRUNE-PLAN-F1.md"));
    f.files.files.set(F2, fixture("expected/PRUNE-PLAN-F2.md"));
    const text = await run(f, { source: "prune", replace: true });
    ok(text.startsWith("dev-plan: workbench/prune/PRUNE-PLAN.md — 2 batches"), text);
    guarded(f);
  });

  it("refuses a replace with fewer batches before any write, naming the sheets to remove", async () => {
    const f = setup();
    const names = ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md", "PRUNE-PLAN-F3.md"];
    f.files.listings.set(CODE, ["SPEC-prune.md", ...names]);
    for (const n of names) f.files.files.set(`${CODE}/${n}`, n === "PRUNE-PLAN.md" ? "# PRUNE-PLAN — old\n" : `# ${n.slice(0, -3)} — old\n`);
    const text = await run(f, { source: "prune", replace: true });
    strictEqual(text, "dev-plan: the new plan has 2 batches and the previous one 3; Orkeon Code cannot delete a file: " +
      "remove workbench/prune/PRUNE-PLAN-F3.md by hand, then /dev-plan prune --replace. Nothing is written.");
    deepStrictEqual(written(f), []);
    strictEqual(f.llm.acts.length, 0);
  });

  it("refuses bad inputs, another checkout, and a source with no id", async () => {
    const f = setup();
    strictEqual(await run(f, { source: 3 }), "dev-plan: invalid crew input: source");
    strictEqual(await run(f, { source: "prune", replace: "yes" }), "dev-plan: invalid crew input: replace");
    f.shell.results[GIT_TOPLEVEL] = { stdout: "/elsewhere\n" };
    strictEqual(await run(f), "dev-plan: run from the checkout at /workspace (git reports /elsewhere)");
    const empty = setup();
    empty.files.files.set(`${CODE}/SPEC-prune.md`, "# prune — Prune\n\n## 1. Context\n\nNothing yet.\n");
    strictEqual(await run(empty), "dev-plan: workbench/prune/SPEC-prune.md names no UC-, BR- or CH- id: nothing to trace");
    deepStrictEqual([...written(f), ...written(empty)], []);
  });

  it("refuses a run when the code index cannot be built", async () => {
    const f = setup();
    f.index.failure = new Error("store offline");
    const text = await run(f);
    strictEqual(text, "dev-plan: the code index cannot be built (store offline): anchors would be guesses, so no plan is written");
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(written(f), []);
  });
});

describe("runDevPlan — a change brief", () => {
  it("refuses a brief whose title names no kind", async () => {
    const f = setup("CHANGE-prune.md");
    f.files.files.set(`${CODE}/CHANGE-prune.md`, fixture("CHANGE-cache.md").replace("# cache — The symbol map is loaded on every call — refactor", "# prune — Load once"));
    strictEqual(await run(f), "dev-plan: workbench/prune/CHANGE-prune.md: the title names no kind (bug, refactor or perf)");
    deepStrictEqual(written(f), []);
  });

  it("gives the planner the pinned test and the rows to characterise, numbered", async () => {
    const f = setup("CHANGE-prune.md");
    f.files.files.set(`${CODE}/CHANGE-prune.md`, fixture("CHANGE-cache.md"));
    f.llm.extractions = [{}];
    await run(f);
    const prompt = f.llm.extracts[0].prompt;
    ok(prompt.includes("Source (change, refactor): workbench/prune/CHANGE-prune.md"));
    ok(prompt.includes("Pinned tests:\n- loads the cached map once"));
    ok(prompt.includes("U1 — an absent map file gives an empty map\nU2 — a malformed map file is reported, not thrown"));
    deepStrictEqual(written(f), []);
  });
});
