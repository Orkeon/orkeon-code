// checkSpecAnswer and renderSpec: a valid answer passes and renders a file /dev-plan's parser reads back (title,
// UC/BR ids, statements, open questions, decisions); each self-check of the template refuses its own fault.
// Run:  node --test src/crews/dev-spec/domain/spec-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { parsePlanSource } from "../../../shared/domain/dev/spec-format.ts";
import { parseDecisions, parseOpenQuestions } from "../../../shared/domain/dev/questions.ts";
import { checkSpecAnswer } from "./spec-answer.ts";
import type { SpecAnswer } from "./spec-answer.ts";
import { renderSpec } from "./spec-render.ts";

const FIXTURE = new URL("../../../../tests/fixtures/dev/spec/answer.json", import.meta.url);
const validSpec = (): SpecAnswer => JSON.parse(readFileSync(FIXTURE, "utf8")) as SpecAnswer;

const problemsOf = (a: unknown): string[] => {
  const c = checkSpecAnswer(a);
  return c.ok ? [] : c.problems;
};

describe("checkSpecAnswer", () => {
  it("accepts a valid answer", () => {
    deepStrictEqual(problemsOf(validSpec()), []);
  });

  it("refuses a use case without actor, Where or scenario", () => {
    const a = validSpec();
    a.useCases[0] = { ...a.useCases[0], actor: "", where: "", scenario: [] };
    const p = problemsOf(a);
    ok(p.includes("UC-01: no actor"), p.join("\n"));
    ok(p.some((x) => x.startsWith("UC-01: no Where")));
    ok(p.some((x) => x.startsWith("UC-01: the nominal scenario")));
  });

  it("refuses a rule applied to a use case that does not exist, or without origin", () => {
    const a = validSpec();
    a.rules[0] = { ...a.rules[0], appliesTo: ["UC-02"], origin: "" };
    const p = problemsOf(a);
    ok(p.some((x) => x.includes("'UC-02' is no use case")));
    ok(p.some((x) => x.startsWith("BR-01: no origin")));
  });

  it("refuses technical words, an unused term and a TBD without question", () => {
    const a = validSpec();
    a.context = "The MemoryStore.prune() call in store.ts returns HTTP 404. TBD";
    a.vocabulary.push({ term: "tombstone", definition: "a removed entry" });
    a.questions = [];
    const p = problemsOf(a);
    ok(p.some((x) => x.startsWith("business purity: a call")), p.join("\n"));
    ok(p.some((x) => x.startsWith("business purity: a file name")));
    ok(p.some((x) => x.startsWith("business purity: an HTTP")));
    ok(p.includes("vocabulary: 'tombstone' is used nowhere else"));
    ok(p.includes("a TBD in the body has no open question"));
  });

  it("refuses a question with one option, a cell with '|' and a name with '—'", () => {
    const a = validSpec();
    a.name = "Prune — old";
    a.questions[1].options = ["Refuse"];
    a.outOfScope[0].reason = "a | b";
    const p = problemsOf(a);
    ok(p.some((x) => x.startsWith("name:")));
    ok(p.some((x) => x.startsWith("question 2: no option, or 2 to")));
    ok(p.some((x) => x.startsWith("outOfScope 1: reason")));
  });
});

describe("renderSpec", () => {
  it("renders a file /dev-plan reads back: title, ids, statements, open questions and decisions", () => {
    const answer = validSpec();
    const text = renderSpec({
      code: "prune", answer,
      open: [{ id: "Q2", severity: "Blocking", question: "Is a pinned entry pruned?", impact: "BR-01", options: ["No", "Yes"] }],
      decisions: [{ id: "Q1", question: "Does a prune with no cut-off refuse?", answer: "Refuse", date: "2026-10-24" }],
    });
    const parsed = parsePlanSource(text, "spec");
    deepStrictEqual(parsed.problems, []);
    strictEqual(parsed.code, "prune");
    strictEqual(parsed.name, "Prune old memory entries");
    deepStrictEqual(parsed.ids.map((i) => [i.id, i.statement]), [
      ["UC-01", "remove the entries saved before a cut-off"], ["BR-01", "a feedback entry stays whatever its age"],
    ]);
    strictEqual(parsed.blocking.length, 1);
    deepStrictEqual(parseOpenQuestions(text).map((q) => [q.id, q.options]), [["Q2", ["No", "Yes"]]]);
    deepStrictEqual(parseDecisions(text).map((d) => d.answer), ["Refuse"]);
    ok(text.includes("## 12. Open questions") && text.includes("## 13. Decisions"));
    ok(!text.includes("## 6. Data"), "an empty section is left out");
  });
});
