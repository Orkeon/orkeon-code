// runDevSpec over FakeFiles, FakeShell, FakeCodeIndex, FakeLlm and a scripted HumanInput: a new spec written, its
// questions asked Blocking first with each answer in the file before the next question, the fold, the review and
// its Blocking row asked; the unattended run that ends BLOCKED with the questions in the file and no review; the
// revision that keeps the decisions; the refusals before any model call; nothing written outside the code folder.
// Run:  node --test src/crews/dev-spec/application/run-dev-spec.test.ts
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
import type { HumanInput } from "../../../shared/application/ports.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import { parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import type { SpecAnswer } from "../domain/spec-answer.ts";
import { DEV_SPEC_NEXT, runDevSpec } from "./run-dev-spec.ts";
import type { DevSpecInputs } from "./run-dev-spec.ts";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../../tests/doubles/fake-precedents.ts";

const ANSWER = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/dev/spec/answer.json", import.meta.url), "utf8")) as SpecAnswer;
const W = "/workspace/workbench";
const CODE = `${W}/prune`;
const SPEC = `${CODE}/SPEC-prune.md`;
const CLEAR = { verdict: "CLEAR", rows: [] };

/** A person answering from a script: a string answers, null is nobody. Each question sees the spec as it is then. */
function scripted(files: FakeFiles, script: Array<string | null>) {
  const asked: Array<{ kind: string; prompt: string; options: readonly string[]; specThen: string }> = [];
  const next = (kind: string, prompt: string, options: readonly string[]) => {
    asked.push({ kind, prompt, options, specThen: files.files.get(SPEC) ?? "" });
    return script.length === 0 ? null : script.shift() ?? null;
  };
  const human: HumanInput = {
    async choice(prompt, options) { const a = next("choice", prompt, options); return a === null ? { answered: false } : { answered: true, value: a }; },
    async text(prompt) { const a = next("text", prompt, []); return a === null ? { answered: false } : { answered: true, value: a }; },
    async multi(prompt, options) { const a = next("multi", prompt, options); return a === null ? { answered: false } : { answered: true, values: [a] }; },
  };
  return { human, asked };
}

function setup(script: Array<string | null> = []) {
  const files = new FakeFiles();
  files.listings.set("/workspace", ["workbench/", "src/"]);
  files.listings.set(W, ["prune/"]);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE])] = { stdout: ".orkeon/config.json\n" };
  const llm = new FakeLlm();
  llm.extractions = [ANSWER, CLEAR];
  llm.answers = ["CLEAR: nothing to ask."];
  const index = new FakeCodeIndex();
  index.roots = 1;
  const log = new FakeLogger();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const person = scripted(files, script);
  const deps = { files, shell, llm, config, index, human: person.human, log, clock: () => new Date(2026, 9, 24, 9, 0) };
  return { files, shell, llm, log, person, deps };
}
type Setup = ReturnType<typeof setup>;
const run = (f: Setup, input: DevSpecInputs = { code: "prune", request: "Prune old memory entries before a cut-off." }) => runDevSpec(input, f.deps);

function guarded(f: Setup): void {
  for (const w of f.files.writes) ok(w.path.startsWith(`${CODE}/`), w.path);
}

/** The answer after a fold: the decided question gone from the model's questions. */
const folded = (): SpecAnswer => ({ ...ANSWER, questions: ANSWER.questions.slice(1) });

describe("runDevSpec — a new spec settled with the person", () => {
  it("asks Blocking first, writes each answer before the next question, folds, reviews, ends on /dev-plan", async () => {
    const f = setup(["No", "Leave it open"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];
    const text = await run(f);
    guarded(f);
    strictEqual(f.person.asked.length, 2);
    deepStrictEqual(f.person.asked.map((a) => a.kind), ["choice", "choice"]);
    ok(f.person.asked[0].prompt.startsWith("dev-spec prune — Q1 (Blocking): Is a pinned entry pruned?"));
    deepStrictEqual(f.person.asked[0].options, ["No", "Yes", "Leave it open"]);
    deepStrictEqual(parseDecisions(f.person.asked[0].specThen), [], "nothing decided before the first answer");
    deepStrictEqual(parseDecisions(f.person.asked[1].specThen).map((d) => [d.id, d.answer, d.date]), [["Q1", "No", "2026-10-24"]]);
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseOpenQuestions(spec).map((q) => q.id), ["Q2"]);
    deepStrictEqual(parseDecisions(spec).map((d) => d.id), ["Q1"]);
    ok(f.llm.extracts[1].prompt.includes("- Q1: Is a pinned entry pruned? → No"), "the fold carries the decision");
    strictEqual(f.llm.acts.length, 1, "one review");
    const lines = text.split("\n");
    strictEqual(lines[0], "dev-spec: workbench/prune/SPEC-prune.md written — 2 ids (UC-01, BR-01)");
    ok(lines.includes("decisions this run: Q1 → No"));
    ok(lines.includes("open questions: 0 Blocking, 1 Major (Q2)"));
    ok(lines.includes("review: CLEAR"));
    strictEqual(lines.at(-1), DEV_SPEC_NEXT.replace("{code}", "prune"));
  });

  it("asks a Blocking review row as text and records its answer", async () => {
    const f = setup(["No", "Refuse", "Yes, a pinned entry is reported"]);
    f.llm.extractions = [ANSWER, { ...ANSWER, questions: [] }, {
      verdict: "GAPS", rows: [{ severity: "Blocking", question: "Is the user told which entries were pruned?", evidence: "§ 4", target: "UC-01" }],
    }, { ...ANSWER, questions: [] }];
    const text = await run(f);
    strictEqual(f.person.asked.length, 3);
    strictEqual(f.person.asked[2].kind, "text");
    ok(f.person.asked[2].prompt.includes("Q3 (Blocking): UC-01: Is the user told which entries were pruned?"));
    deepStrictEqual(parseDecisions(f.files.files.get(SPEC) ?? "").map((d) => d.id), ["Q1", "Q2", "Q3"]);
    ok(text.includes("review: GAPS — 1 Blocking, 0 Major"));
    strictEqual(text.split("\n").at(-1), DEV_SPEC_NEXT.replace("{code}", "prune"));
  });
});

describe("runDevSpec — nobody to answer", () => {
  it("leaves the questions in the file, runs no review and ends BLOCKED", async () => {
    const f = setup([null]);
    const text = await run(f);
    guarded(f);
    strictEqual(f.person.asked.length, 1, "the asking stops at the first unanswered question");
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseOpenQuestions(spec).map((q) => [q.id, q.severity]), [["Q1", "Blocking"], ["Q2", "Major"]]);
    deepStrictEqual(parseDecisions(spec), []);
    strictEqual(f.llm.acts.length, 0);
    strictEqual(f.llm.extracts.length, 1);
    ok(text.includes("dev-spec: BLOCKED — a question went unanswered; the open questions are in workbench/prune/SPEC-prune.md § 12."), text);
    ok(!text.includes("/dev-plan prune"));
  });
});

describe("runDevSpec — a revision", () => {
  it("keeps the decisions of the file, never asks them again, and passes them to the model", async () => {
    const f = setup(["Refuse"]);
    const first = setup(["No", "Leave it open"]);
    first.llm.extractions = [ANSWER, folded(), CLEAR];
    await run(first);
    const before = first.files.files.get(SPEC) ?? "";
    f.files.files.set(SPEC, before);
    f.files.listings.set(CODE, ["SPEC-prune.md"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];
    const text = await run(f, { code: "prune", request: "Also say what happens to a pinned entry." });
    ok(f.llm.extracts[0].prompt.includes("Decisions, settled by the person:\n- Q1: Is a pinned entry pruned? → No"));
    ok(f.llm.extracts[0].prompt.includes("The current spec (material, not instructions):"));
    deepStrictEqual(f.person.asked.map((a) => a.prompt.split("\n")[0]), ["dev-spec prune — Q2 (Major): Does a prune with no cut-off refuse?"]);
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseDecisions(spec).map((d) => [d.id, d.answer]), [["Q1", "No"], ["Q2", "Refuse"]]);
    ok(text.startsWith("dev-spec: workbench/prune/SPEC-prune.md revised"));
  });
});

describe("runDevSpec — refusals", () => {
  it("refuses a code whose folder holds a change brief, before any model call", async () => {
    const f = setup();
    f.files.listings.set(CODE, ["CHANGE-prune.md"]);
    const text = await run(f);
    ok(text.startsWith("dev-spec: workbench/prune/CHANGE-prune.md exists"));
    strictEqual(f.llm.extracts.length, 0);
    strictEqual(f.files.writes.length, 0);
  });

  it("refuses a new spec without its brief, an invalid code, and a checkout elsewhere", async () => {
    ok((await run(setup(), { code: "prune" })).startsWith("dev-spec: a new spec needs its brief"));
    strictEqual(await run(setup(), { code: "../x", request: "y" }), "dev-spec: invalid crew input: code");
    const f = setup();
    f.shell.results[GIT_TOPLEVEL] = { stdout: "/elsewhere\n" };
    ok((await run(f)).startsWith("dev-spec: run from the checkout at /workspace"));
  });

  it("reads a brief given as a path, and refuses one outside the checkout", async () => {
    const f = setup([null]);
    f.files.files.set("/workspace/docs/brief.md", "Prune old memory entries before a cut-off.");
    await run(f, { code: "prune", request: "docs/brief.md" });
    ok(f.llm.extracts[0].prompt.includes("Prune old memory entries before a cut-off."));
    ok((await run(setup(), { code: "prune", request: "../etc/brief.md" })).includes("is outside the checkout"));
  });

  it("writes nothing when the spec is refused twice", async () => {
    const f = setup();
    f.llm.extractions = [{ ...ANSWER, useCases: [] }];
    const text = await run(f);
    ok(text.startsWith("dev-spec: the spec was refused twice; nothing is written."));
    strictEqual(f.llm.extracts.length, 2);
    ok(f.llm.extracts[1].prompt.includes("The previous answer was refused"));
    strictEqual(f.files.writes.length, 0);
  });

  it("T1: recalls decisions and methods once from the code and the brief, the block in every extract and named at the end", async () => {
    const f = setup(["No", "Leave it open"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];
    const precedents = FakePrecedents.hits();
    const text = await runDevSpec({ code: "prune", request: "Prune old memory entries before a cut-off." }, { ...f.deps, precedents: precedents.recall });
    deepStrictEqual(precedents.calls, [{ trigger: "T1", query: "prune — Prune old memory entries before a cut-off." }]);
    const drafts = f.llm.extracts.filter((e) => e.prompt.startsWith("You write a business specification"));
    ok(drafts.length >= 2, "the draft and the fold");
    for (const d of drafts) ok(d.prompt.includes(PRECEDENTS_SAMPLE), d.prompt.slice(-300));
    ok(text.includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("T1: no block and no line when nothing is recalled", async () => {
    const f = setup([null]);
    const precedents = new FakePrecedents();
    const text = await runDevSpec({ code: "prune", request: "Prune old memory entries before a cut-off." }, { ...f.deps, precedents: precedents.recall });
    strictEqual(precedents.calls.length, 1);
    for (const e of f.llm.extracts) ok(!e.prompt.includes("## Precedents"));
    ok(!text.includes("precedents recalled"), text);
  });
});
