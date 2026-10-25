// The pack, the golden answer, the inventory and the source the plan renderer tests read, the render builder, the
// review rows and the lines longer than one the renders are compared with.
import { readFileSync } from "node:fs";

import { renderPlan, repoLines } from "./plan-render.ts";
import type { RenderInput, RenderedPlan } from "./plan-render.ts";
import type { InventoryEntry } from "./inventory-model.ts";
import type { AnchorRef, PlanAnswer } from "./plan-answer.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { ReviewAnswer } from "../../../shared/domain/dev/review-answer.ts";
import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";

const FIXTURES = new URL("../../../../tests/fixtures/dev/plan/", import.meta.url);
const fixture = (name: string): string => readFileSync(new URL(name, FIXTURES), "utf8");
export const json = <T>(name: string): T => JSON.parse(fixture(name)) as T;

/** The pack a YAML text holds; throws when it does not parse. */
export function pack(text: string): RepoPack {
  const r = parseRepoPack(text);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const PACK = pack(fixture("pack.yaml"));
const ANSWER = json<PlanAnswer>("answer.json");
const INVENTORY = new Map(json<{ entries: InventoryEntry[] }>("inventory.json").entries.map((e) => [e.ref, e]));
const SOURCE = parsePlanSource(fixture("SPEC-prune.md"), "spec");

/** The render of the golden answer against SPEC-prune.md, `over` laid over the input and `edit` applied to a copy of the answer. */
export function render(over: Partial<RenderInput> = {}, edit?: (a: PlanAnswer) => void): RenderedPlan {
  const answer = structuredClone(ANSWER);
  edit?.(answer);
  return renderPlan({
    prefix: "PRUNE", sourceShown: "workbench/prune/SPEC-prune.md", kind: "spec", sourceIds: SOURCE.ids,
    repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: INVENTORY, answer, review: null, date: "2026-10-22", ...over,
  });
}

export const linesOf = (text: string): string[] => text.split("\n");
export const lineStarting = (text: string, start: string): string | undefined => linesOf(text).find((l) => l.startsWith(start));
export const row = (severity: "Blocking" | "Major", target: string, question: string, evidence = "workbench/prune/SPEC-prune.md:31"): ReviewAnswer["rows"][number] =>
  ({ severity, question, evidence, target });

export const PACK_COMMANDS = "restore `npm ci` · build `npm run build` · build_test (not in the pack) · test_class `node --test <Class>` · " +
  "test `npm test` · test_project (not in the pack) · test_integration (not in the pack) — from `.orkeon/repo.yaml`";
export const PACK_LAYOUT = "domain `src/shared/domain` · application `src/shared/application` · infrastructure `src/shared/infrastructure` · " +
  "tests `tests` — from `.orkeon/repo.yaml`";
export const NO_PACK_COMMANDS = "restore (not in the pack) · build (not in the pack) · build_test (not in the pack) · " +
  "test_class (not in the pack) · test (not in the pack) · test_project (not in the pack) · " +
  "test_integration (not in the pack) — no repository pack: add .orkeon/repo.yaml";

/** Gives the first test repeated and unordered ids. */
export const UNORDERED_IDS = (a: PlanAnswer): void => { a.batches[0].steps[0].tests[0].ids = ["UC-01", "BR-10", "BR-9", "UC-01"]; };

/** Empties reuse, and gives two out-of-scope items and one assumption. */
export const LISTS = (a: PlanAnswer): void => { a.reuse = []; a.outOfScope = ["one", "two"]; a.assumptions = ["the store is local"]; };

/** Leaves the second test without an id, and adds a test element first and an adapter element last. */
export const NO_ID_AND_LAYERS = (a: PlanAnswer): void => {
  a.batches[0].steps[0].tests[1].ids = [];
  a.batches[0].elements.unshift({ layer: "test", signature: "FakeClock", rule: "a fixed date" });
  a.batches[0].elements.push({ layer: "adapter", signature: "FileMemoryStore.save(entries: MemoryEntry[]): void", rule: "one write" });
};

/** Reverses the non-applicable rows. */
export const REVERSED_NON_APPLICABLE = (a: PlanAnswer): void => { a.nonApplicable.reverse(); };

/** Gives the first step a ref, an existing and a create anchor in each column. */
export const THREE_KINDS = (a: PlanAnswer): void => {
  const anchors: { tests: AnchorRef[]; doubles: AnchorRef[]; production: AnchorRef[] } = {
    tests: [{ kind: "ref", ref: "I3" }, { kind: "existing", path: "tests/fixtures/memory.json" }, { kind: "create", path: "tests/prune.test.ts" }],
    doubles: [{ kind: "ref", ref: "I4" }, { kind: "existing", path: "tests/support/fake-clock.ts", member: "advance" }, { kind: "create", path: "tests/support/fake-prune.ts" }],
    production: [{ kind: "ref", ref: "I1" }, { kind: "existing", path: "config/memory.yaml", member: "maxAge" }, { kind: "create", path: "src/shared/domain/memory-prune.ts" }],
  };
  a.batches[0].steps[0].anchors = anchors;
};

export const THREE_KINDS_ROW = "| 1 — An entry older than the cut-off is removed | " +
  "`tests/commands-memory.test.ts:12` — existing; `tests/fixtures/memory.json` — existing; `tests/prune.test.ts` — to create | " +
  "`tests/support/fake-memory-store.ts:9`; `tests/support/fake-clock.ts` — existing (`advance` to add); `tests/support/fake-prune.ts` — to create | " +
  "`src/shared/domain/memory.ts:18`; `config/memory.yaml` — existing — `maxAge`; `src/shared/domain/memory-prune.ts` — to create |";

export const STEP_NOTE = "| 1 | `the generated command table matches the command files` | unit | `tests` | UC-01 |\n\n" +
  "The English page and its French twin change together: the parity check reads both.\n\nTDD: RED [ ] GREEN [ ] COST [ ]\n";

export const MAJOR_ON_F2: ReviewAnswer = { verdict: "GAPS", rows: [row("Major", "F2", "Does the French page list the option too?", "docs/fr/commands.md:40.")] };
export const MAJOR_ON_F2_DECISION = "## Decisions\n- 2026-10-22 — review (Major): Does the French page list the option too? Evidence: docs/fr/commands.md:40. " +
  "Not settled by the plan run: answer it here before the first failing test of the step it concerns.\n\n## TDD sequence";

export const MAJOR_ON_PLAN: ReviewAnswer = { verdict: "GAPS", rows: [row("Major", "plan", "Is one batch enough for the rule and the command?", "## 0. Summary")] };
export const MAJOR_ON_PLAN_SECTION = "## 4. Open questions\n\n| # | Severity | Question | Evidence |\n|---|----------|----------|----------|\n" +
  "| 1 | Major | Is one batch enough for the rule and the command? | ## 0. Summary |\n";

export const LABELLED_REVIEW: ReviewAnswer = {
  verdict: "GAPS",
  rows: [
    row("Major", "F1", "Should the Non-applicable rules list name DDD-05?", "Applied rules row of § 3"),
    row("Major", "plan", "Is APP-02 right under Non-applicable rules?", "Non-applicable rules of § 1"),
  ],
};

export const BLOCKING_QUESTION_ROW =
  "| 1 | Blocking | Is the applied rules row of F1 right to apply PERF-01 when the store is read once? | workbench/prune/SPEC-prune.md:24 |\n";

export const MAJOR_THEN_BLOCKING_ON_PLAN: ReviewAnswer = {
  verdict: "GAPS",
  rows: [row("Major", "plan", "Is the reason of F2 right?", "## 0. Summary"), row("Blocking", "plan", "Is a cut-off required?", "§ 4")],
};

export const BLOCKING_AND_MAJOR_ON_F1: ReviewAnswer = {
  verdict: "GAPS",
  rows: [row("Blocking", "F1", "Is a cut-off required?", "§ 4"), row("Major", "F1", "Is the reason of F1 right?", "## 0. Summary")],
};
