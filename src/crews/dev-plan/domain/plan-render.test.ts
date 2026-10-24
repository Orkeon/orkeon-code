// Unit tests for the plan renderer: the Scope lines from the pack, the anchor kinds, the
// review's rows in the plan and the sheets, the blocked state, the ids and the joins. Run:
//   node --test src/crews/dev-plan/domain/plan-render.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { renderPlan, repoLines } from "./plan-render.ts";
import type { RenderInput, RenderedPlan } from "./plan-render.ts";
import type { InventoryEntry } from "./inventory-model.ts";
import type { PlanAnswer } from "./plan-answer.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { ReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

function pack(text: string): RepoPack {
  const r = parseRepoPack(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

const PACK = pack(fixture("pack.yaml"));
const ANSWER = json<PlanAnswer>("answer.json");
const INVENTORY = new Map(json<{ entries: InventoryEntry[] }>("inventory.json").entries.map((e) => [e.ref, e]));
const SOURCE = parsePlanSource(fixture("SPEC-prune.md"), "spec");

function render(over: Partial<RenderInput> = {}, edit?: (a: PlanAnswer) => void): RenderedPlan {
  const answer = structuredClone(ANSWER);
  edit?.(answer);
  return renderPlan({
    prefix: "PRUNE", sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec", sourceIds: SOURCE.ids,
    repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: INVENTORY, answer, review: null, date: "2026-10-22", ...over,
  });
}

const linesOf = (text: string): string[] => text.split("\n");
const lineStarting = (text: string, start: string): string | undefined => linesOf(text).find((l) => l.startsWith(start));
const row = (severity: "Blocking" | "Major", target: string, question: string, evidence = "workbench/prune/SPEC-prune.md:31"): ReviewAnswer["rows"][number] =>
  ({ severity, question, evidence, target });

describe("repoLines", () => {
  it("writes each command key, set or absent, then where the pack is", () => {
    const r = repoLines(PACK, ".orkeon/repo.yaml");
    strictEqual(r.commands, "restore `npm ci` · build `npm run build` · build_test (not in the pack) · test_class `node --test <Class>` · " +
      "test `npm test` · test_project (not in the pack) · test_integration (not in the pack) — from `.orkeon/repo.yaml`");
    strictEqual(r.layout, "domain `src/shared/domain` · application `src/shared/application` · infrastructure `src/shared/infrastructure` · " +
      "tests `tests` — from `.orkeon/repo.yaml`");
    deepStrictEqual(r.absent, ["commands.build_test", "commands.test_project", "commands.test_integration"]);
  });
  it("leaves an absent layout key out, and says when the pack names no root", () => {
    const some = repoLines(pack("layout:\n  tests: test\ncommands:\n  test: make test\n"), "repo.yaml");
    strictEqual(some.layout, "tests `test` — from `repo.yaml`");
    ok(some.absent.includes("layout.domain"));
    const none = repoLines(pack("commands:\n  test: make test\n"), "repo.yaml");
    strictEqual(none.layout, "(not in the pack) — from `repo.yaml`");
  });
  it("marks every key absent without a pack", () => {
    const r = repoLines(null, null);
    strictEqual(r.commands, "restore (not in the pack) · build (not in the pack) · build_test (not in the pack) · " +
      "test_class (not in the pack) · test (not in the pack) · test_project (not in the pack) · " +
      "test_integration (not in the pack) — no repository pack: add .orkeon/repo.yaml");
    strictEqual(r.layout, "(not in the pack) — no repository pack: add .orkeon/repo.yaml");
    strictEqual(r.absent.length, 11);
  });
});

describe("renderPlan: the files", () => {
  it("names the plan and one sheet per batch, every line without a trailing space, one final line break", () => {
    const out = render();
    deepStrictEqual([out.plan.name, ...out.sheets.map((s) => s.name)], ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]);
    for (const text of [out.plan.text, ...out.sheets.map((s) => s.text)]) {
      ok(text.endsWith("|\n") && !text.endsWith("\n\n"));
      ok(linesOf(text).every((l) => l === l.trimEnd()));
    }
  });
  it("writes a brief's source line and its sheets' Change line", () => {
    const out = render({ kind: "change", changeKind: "refactor", sourceShown: "workbench/cache/CHANGE-cache.md" });
    strictEqual(lineStarting(out.plan.text, "- **Change**"), "- **Change**: `workbench/cache/CHANGE-cache.md` (`refactor`)");
    strictEqual(linesOf(out.sheets[0].text)[2], "> Batch F1 of `PRUNE-PLAN.md`. Change: `workbench/cache/CHANGE-cache.md`.");
  });
});

describe("renderPlan: ids and joins", () => {
  it("orders a batch's ids BR and CH by number, then UC after a slash", () => {
    const out = render({}, (a) => { a.batches[0].steps[0].tests[0].ids = ["UC-01", "BR-10", "BR-9", "UC-01"]; });
    strictEqual(lineStarting(out.plan.text, "| F1 |")?.split(" | ")[2], "BR-01, BR-02, BR-03, BR-9, BR-10 / UC-01");
    ok(out.sheets[0].text.includes("**Ids**: BR-01, BR-02, BR-03, BR-9, BR-10 / UC-01. **Depends on**: [none]"));
    strictEqual(lineStarting(out.sheets[1].text, "The command reference"), "The command reference and the memory page describe /memory prune. **Ids**: UC-01. **Depends on**: F1");
  });
  it("joins reuse with ; and the owners with +, and writes none for an empty list", () => {
    const out = render({}, (a) => { a.reuse = []; a.outOfScope = ["one", "two"]; a.assumptions = ["the store is local"]; });
    strictEqual(lineStarting(out.plan.text, "- **Reuse**"), "- **Reuse**: none");
    strictEqual(lineStarting(out.plan.text, "- **Out of scope**"), "- **Out of scope**: one; two");
    strictEqual(lineStarting(out.plan.text, "- **Assumptions**"), "- **Assumptions**: the store is local");
    strictEqual(lineStarting(out.plan.text, "| UC-01"), "| UC-01 — Prune old memory entries | `runMemory()` + `pruneEntries()` | F1, F2 |");
  });
  it("lists the non-applicable rules in design-rule order whatever the answer's order", () => {
    const out = render({}, (a) => { a.nonApplicable.reverse(); });
    ok(lineStarting(out.plan.text, "- **Non-applicable rules**")?.startsWith("- **Non-applicable rules**: DDD-04: N/A — the cut-off"));
  });
  it("writes the step note after a blank line and before the TDD line", () => {
    const text = render().sheets[1].text;
    ok(text.includes("| 1 | `the generated command table matches the command files` | unit | `tests` | UC-01 |\n\n" +
      "The English page and its French twin change together: the parity check reads both.\n\nTDD: RED [ ] GREEN [ ] COST [ ]\n"));
  });
  it("writes a dash for a test without an id, and the layer labels in order", () => {
    const out = render({}, (a) => {
      a.batches[0].steps[0].tests[1].ids = [];
      a.batches[0].elements.unshift({ layer: "test", signature: "FakeClock", rule: "a fixed date" });
      a.batches[0].elements.push({ layer: "adapter", signature: "FileMemoryStore.save(entries: MemoryEntry[]): void", rule: "one write" });
    });
    ok(out.sheets[0].text.includes("| 2 | `refuses a cut-off in the future` | unit | `src/shared/domain` | — |"));
    const labels = linesOf(out.sheets[0].text).filter((l) => /^\*\*(Domain|Application|Adapters|Tests)\*\*$/.test(l));
    deepStrictEqual(labels, ["**Domain**", "**Application**", "**Adapters**", "**Tests**"]);
  });
});

describe("renderPlan: anchors", () => {
  it("renders the three kinds in each column", () => {
    const out = render({}, (a) => {
      a.batches[0].steps[0].anchors = {
        tests: [{ kind: "ref", ref: "I3" }, { kind: "existing", path: "tests/fixtures/memory.json" }, { kind: "create", path: "tests/prune.test.ts" }],
        doubles: [{ kind: "ref", ref: "I4" }, { kind: "existing", path: "tests/support/fake-clock.ts", member: "advance" }, { kind: "create", path: "tests/support/fake-prune.ts" }],
        production: [{ kind: "ref", ref: "I1" }, { kind: "existing", path: "config/memory.yaml", member: "maxAge" }, { kind: "create", path: "src/shared/domain/memory-prune.ts" }],
      };
    });
    strictEqual(lineStarting(out.sheets[0].text, "| 1 — "), "| 1 — An entry older than the cut-off is removed | " +
      "`tests/commands-memory.test.ts:12` — existing; `tests/fixtures/memory.json` — existing; `tests/prune.test.ts` — to create | " +
      "`tests/support/fake-memory-store.ts:9`; `tests/support/fake-clock.ts` — existing (`advance` to add); `tests/support/fake-prune.ts` — to create | " +
      "`src/shared/domain/memory.ts:18`; `config/memory.yaml` — existing — `maxAge`; `src/shared/domain/memory-prune.ts` — to create |");
  });
  it("closes the table with the build step row", () => {
    strictEqual(lineStarting(render().sheets[0].text, "| 4 — "), "| 4 — Build and tests | — | — | — |");
  });
});

describe("renderPlan: the review", () => {
  it("leaves ## Decisions out of a sheet with no decision and no review row", () => {
    const out = render();
    ok(out.sheets[0].text.includes("## Decisions\n- 2026-10-22 — The age is read"));
    strictEqual(out.sheets[1].text.includes("## Decisions"), false);
    strictEqual(out.plan.text.includes("Open questions"), false);
  });
  it("puts a Major row on a batch under its sheet's ## Decisions, created when absent, and adds no ## 4", () => {
    const review: ReviewAnswer = { verdict: "GAPS", rows: [row("Major", "F2", "Does the French page list the option too?", "docs/fr/commands.md:40.")] };
    const out = render({ review });
    ok(out.sheets[1].text.includes("## Decisions\n- 2026-10-22 — review (Major): Does the French page list the option too? Evidence: docs/fr/commands.md:40. " +
      "Not settled by the plan run: answer it here before the first failing test of the step it concerns.\n\n## TDD sequence"));
    strictEqual(out.plan.text.includes("## 4. Open questions"), false);
    ok(out.plan.text.includes("### Batch F1 — Prune by age — open"));
  });
  it("puts a plan-level Major row in ## 4 and keeps the batches open", () => {
    const review: ReviewAnswer = { verdict: "GAPS", rows: [row("Major", "plan", "Is one batch enough for the rule and the command?", "## 0. Summary")] };
    const text = render({ review }).plan.text;
    ok(text.endsWith("## 4. Open questions\n\n| # | Severity | Question | Evidence |\n|---|----------|----------|----------|\n" +
      "| 1 | Major | Is one batch enough for the rule and the command? | ## 0. Summary |\n"));
    ok(text.includes("— open\n"));
  });
  it("lower-cases the classification labels in every review cell and decision line", () => {
    const review: ReviewAnswer = {
      verdict: "GAPS",
      rows: [
        row("Major", "F1", "Should the Non-applicable rules list name DDD-05?", "Applied rules row of § 3"),
        row("Major", "plan", "Is APP-02 right under Non-applicable rules?", "Non-applicable rules of § 1"),
      ],
    };
    const out = render({ review });
    ok(out.sheets[0].text.includes("review (Major): Should the non-applicable rules list name DDD-05? Evidence: applied rules row of § 3."));
    ok(out.plan.text.includes("| 1 | Major | Is APP-02 right under non-applicable rules? | non-applicable rules of § 1 |"));
    strictEqual(linesOf(out.sheets[0].text).filter((l) => l.includes("Applied rules")).length, 1);
  });
  it("blocks every batch on a Blocking row and points the targeted sheet to the question", () => {
    const out = render({ review: json<ReviewAnswer>("review-blocking.json") });
    deepStrictEqual(linesOf(out.plan.text).filter((l) => l.startsWith("### Batch")), [
      "### Batch F1 — Prune by age — blocked", "### Batch F2 — Command reference — blocked",
    ]);
    ok(out.plan.text.endsWith("| 1 | Blocking | Is the applied rules row of F1 right to apply PERF-01 when the store is read once? | workbench/prune/SPEC-prune.md:24 |\n"));
    ok(out.sheets[0].text.includes("## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)\n- 2026-10-22 — The age is read"));
    strictEqual(out.sheets[1].text.includes("## Decisions"), false);
  });
  it("numbers Blocking rows before plan-level Major rows, and a plan-wide Blocking row reaches every sheet", () => {
    const review: ReviewAnswer = {
      verdict: "GAPS",
      rows: [row("Major", "plan", "Is the reason of F2 right?", "## 0. Summary"), row("Blocking", "plan", "Is a cut-off required?", "§ 4")],
    };
    const out = render({ review });
    ok(out.plan.text.includes("| 1 | Blocking | Is a cut-off required? | § 4 |\n| 2 | Major | Is the reason of F2 right? | ## 0. Summary |\n"));
    for (const s of out.sheets) ok(s.text.includes("## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)\n"));
  });
  it("writes the Blocked by line and the review's Major lines under ## Decisions in one format, a bullet", () => {
    const review: ReviewAnswer = {
      verdict: "GAPS",
      rows: [row("Blocking", "F1", "Is a cut-off required?", "§ 4"), row("Major", "F1", "Is the reason of F1 right?", "## 0. Summary")],
    };
    const text = render({ review }).sheets[0].text;
    const decisions = text.slice(text.indexOf("## Decisions\n") + "## Decisions\n".length).split("\n## ")[0];
    const blocked = linesOf(decisions).filter((l) => l.includes("Blocked by question"));
    const major = linesOf(decisions).filter((l) => l.includes("review (Major)"));
    strictEqual(blocked.length, 1);
    strictEqual(major.length, 1);
    ok(blocked[0].startsWith("- ") && major[0].startsWith("- "), `${blocked[0]}\n${major[0]}`);
  });
});
