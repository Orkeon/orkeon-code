// settleQuestions and questionRound over a scripted HumanInput: one question at a time, Blocking first, each answer
// saved before the next question, "Leave it open" keeping the row, nobody answering stopping at once, and the fold
// after a round (its failure keeping the decisions). Run:  node --test src/shared/application/dev/settle-questions.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import type { HumanInput } from "../ports.ts";
import { LEAVE_OPEN, parseDecisions } from "../../domain/dev/questions.ts";
import type { Question } from "../../domain/dev/questions.ts";
import { settleQuestions } from "./settle-questions.ts";
import { questionRound } from "./question-round.ts";

const Q1: Question = { id: "Q1", severity: "Major", question: "A?", impact: "", options: ["Yes", "No"] };
const Q2: Question = { id: "Q2", severity: "Blocking", question: "B?", impact: "", options: [] };
const Q3: Question = { id: "Q3", severity: "Major", question: "C?", impact: "", options: ["X", "Y"] };

function person(script: Array<string | null>, log: string[]) {
  const answer = (p: string) => { log.push(`ask ${p.split(" — ")[1].split(" ")[0]}`); const a = script.shift(); return a === undefined || a === null ? null : a; };
  const human: HumanInput = {
    async choice(p) { const a = answer(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async text(p) { const a = answer(p); return a === null ? { answered: false } : { answered: true, value: a }; },
    async multi() { return { answered: false }; },
  };
  return human;
}

describe("settleQuestions", () => {
  it("asks Blocking first, saves after each answer, keeps a row left open", async () => {
    const log: string[] = [];
    const out = await settleQuestions("dev-spec x", [Q1, Q2, Q3], [], {
      human: person(["free answer", LEAVE_OPEN, "Y"], log), today: "2026-10-24",
      save: async (open, ds) => { log.push(`save ${open.map((q) => q.id).join(",")} / ${ds.map((d) => d.id).join(",")}`); },
    });
    deepStrictEqual(log, ["ask Q2", "save Q1,Q3 / Q2", "ask Q1", "ask Q3", "save Q1 / Q2,Q3"]);
    deepStrictEqual(out.open.map((q) => q.id), ["Q1"]);
    deepStrictEqual(out.made.map((d) => [d.id, d.answer]), [["Q2", "free answer"], ["Q3", "Y"]]);
    strictEqual(out.blocked, false);
  });

  it("stops at once when nobody answers, deciding nothing", async () => {
    const log: string[] = [];
    const out = await settleQuestions("x", [Q1, Q2], [], { human: person([null], log), today: "d", save: async () => { log.push("save"); } });
    deepStrictEqual(log, ["ask Q2"]);
    strictEqual(out.blocked, true);
    deepStrictEqual(out.open.map((q) => q.id), ["Q1", "Q2"]);
  });
});

describe("questionRound", () => {
  it("writes each answer in the file, then folds once", async () => {
    const writes: string[] = [];
    const out = await questionRound({ text: "# x — Y\n", open: [Q1], decisions: [] }, {
      human: person(["Yes"], []), today: "d", label: "x", headings: { questions: "## 12. Open questions", decisions: "## 13. Decisions" },
      write: async (t) => { writes.push(t); },
      fold: async (st, fresh) => ({ ok: true, text: `${st.text}folded ${fresh.length}\n`, open: [] }),
    });
    strictEqual(writes.length, 2);
    deepStrictEqual(parseDecisions(writes[0]).map((d) => d.answer), ["Yes"]);
    ok(writes[1].endsWith("folded 1\n"));
    strictEqual(out.state.text, writes[1]);
  });

  it("keeps the decisions when the fold fails, and says so", async () => {
    const writes: string[] = [];
    const out = await questionRound({ text: "# x — Y\n", open: [Q1], decisions: [] }, {
      human: person(["No"], []), today: "d", label: "x", headings: { questions: "## 12. Open questions", decisions: "## 13. Decisions" },
      write: async (t) => { writes.push(t); },
      fold: async () => ({ ok: false, problems: ["refused"] }),
    });
    strictEqual(writes.length, 1);
    ok(out.warnings[0].includes("they are recorded under Decisions"));
    deepStrictEqual(out.state.decisions.map((d) => d.answer), ["No"]);
  });
});
