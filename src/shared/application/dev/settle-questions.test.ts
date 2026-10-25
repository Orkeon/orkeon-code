// settleQuestions and questionRound over a scripted HumanInput: one question at a time, Blocking first, each answer
// saved before the next question, "Leave it open" keeping the row, nobody answering stopping at once, and the fold
// after a round (its failure keeping the decisions). Run:  node --test src/shared/application/dev/settle-questions.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { LEAVE_OPEN, parseDecisions } from "../../domain/dev/questions.ts";
import { settleQuestions } from "./settle-questions.ts";
import type { SettleDeps } from "./settle-questions.ts";
import { questionRound } from "./question-round.ts";
import type { RoundDeps } from "./question-round.ts";
import { person, Q1, Q2, Q3, ROUND_HEADINGS, roundStart } from "./settle-questions.fixtures.ts";

describe("settleQuestions", () => {
  it("asks Blocking first, saves after each answer, keeps a row left open", async () => {
    // Arrange
    const log: string[] = [];
    const deps: SettleDeps = {
      human: person(["free answer", LEAVE_OPEN, "Y"], log), today: "2026-10-24",
      save: async (open, ds) => { log.push(`save ${open.map((q) => q.id).join(",")} / ${ds.map((d) => d.id).join(",")}`); },
    };

    // Act
    const out = await settleQuestions("dev-spec x", [Q1, Q2, Q3], [], deps);

    // Assert
    deepStrictEqual(log, ["ask Q2", "save Q1,Q3 / Q2", "ask Q1", "ask Q3", "save Q1 / Q2,Q3"]);
    deepStrictEqual(out.open.map((q) => q.id), ["Q1"]);
    deepStrictEqual(out.made.map((d) => [d.id, d.answer]), [["Q2", "free answer"], ["Q3", "Y"]]);
    strictEqual(out.blocked, false);
  });

  it("stops at once when nobody answers, deciding nothing", async () => {
    // Arrange
    const log: string[] = [];
    const deps: SettleDeps = { human: person([null], log), today: "d", save: async () => { log.push("save"); } };

    // Act
    const out = await settleQuestions("x", [Q1, Q2], [], deps);

    // Assert
    deepStrictEqual(log, ["ask Q2"]);
    strictEqual(out.blocked, true);
    deepStrictEqual(out.open.map((q) => q.id), ["Q1", "Q2"]);
  });
});

describe("questionRound", () => {
  it("writes each answer in the file, then folds once", async () => {
    // Arrange
    const writes: string[] = [];
    const deps: RoundDeps = {
      human: person(["Yes"], []), today: "d", label: "x", headings: ROUND_HEADINGS,
      write: async (t) => { writes.push(t); },
      fold: async (st, fresh) => ({ ok: true, text: `${st.text}folded ${fresh.length}\n`, open: [] }),
    };

    // Act
    const out = await questionRound(roundStart(), deps);

    // Assert
    strictEqual(writes.length, 2);
    deepStrictEqual(parseDecisions(writes[0]).map((d) => d.answer), ["Yes"]);
    ok(writes[1].endsWith("folded 1\n"), writes[1]);
    strictEqual(out.state.text, writes[1]);
  });

  it("keeps the decisions when the fold fails, and says so", async () => {
    // Arrange
    const writes: string[] = [];
    const deps: RoundDeps = {
      human: person(["No"], []), today: "d", label: "x", headings: ROUND_HEADINGS,
      write: async (t) => { writes.push(t); },
      fold: async () => ({ ok: false, problems: ["refused"] }),
    };

    // Act
    const out = await questionRound(roundStart(), deps);

    // Assert
    strictEqual(writes.length, 1);
    ok(out.warnings[0].includes("they are recorded under Decisions"), out.warnings[0]);
    deepStrictEqual(out.state.decisions.map((d) => d.answer), ["No"]);
  });
});
