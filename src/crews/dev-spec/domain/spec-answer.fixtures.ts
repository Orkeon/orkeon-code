// The spec answers checkSpecAnswer and renderSpec are tested on, built from tests/fixtures/dev/spec/answer.json.
import { readFileSync } from "node:fs";

import type { SpecAnswer } from "./spec-answer.ts";
import type { ProblemCheck } from "./spec-answer.assertions.ts";

const FIXTURE = new URL("../../../../tests/fixtures/dev/spec/answer.json", import.meta.url);

/** A valid answer, read afresh for each test so it may be changed. */
export const validSpec = (): SpecAnswer => JSON.parse(readFileSync(FIXTURE, "utf8")) as SpecAnswer;

export interface RefusedSpecCase {
  name: string;
  answer: () => SpecAnswer;
  problems: readonly ProblemCheck[];
}

/** Answers checkSpecAnswer refuses, and the problems it names for each. */
export const REFUSED_SPECS: readonly RefusedSpecCase[] = [
  {
    name: "a use case without actor, Where or scenario",
    answer: () => {
      const a = validSpec();
      a.useCases[0] = { ...a.useCases[0], actor: "", where: "", scenario: [] };
      return a;
    },
    problems: [{ is: "UC-01: no actor" }, { startsWith: "UC-01: no Where" }, { startsWith: "UC-01: the nominal scenario" }],
  },
  {
    name: "a rule applied to a use case that does not exist, or without origin",
    answer: () => {
      const a = validSpec();
      a.rules[0] = { ...a.rules[0], appliesTo: ["UC-02"], origin: "" };
      return a;
    },
    problems: [{ includes: "'UC-02' is no use case" }, { startsWith: "BR-01: no origin" }],
  },
  {
    name: "technical words, an unused term and a TBD without question",
    answer: () => {
      const a = validSpec();
      a.context = "The MemoryStore.prune() call in store.ts returns HTTP 404. TBD";
      a.vocabulary.push({ term: "tombstone", definition: "a removed entry" });
      a.questions = [];
      return a;
    },
    problems: [
      { startsWith: "business purity: a call" },
      { startsWith: "business purity: a file name" },
      { startsWith: "business purity: an HTTP" },
      { is: "vocabulary: 'tombstone' is used nowhere else" },
      { is: "a TBD in the body has no open question" },
    ],
  },
  {
    name: "a question with one option, a cell with '|' and a name with '—'",
    answer: () => {
      const a = validSpec();
      a.name = "Prune — old";
      a.questions[1].options = ["Refuse"];
      a.outOfScope[0].reason = "a | b";
      return a;
    },
    problems: [{ startsWith: "name:" }, { startsWith: "question 2: no option, or 2 to" }, { startsWith: "outOfScope 1: reason" }],
  },
];

/** The open question and the decision the rendered spec carries. */
export const OPEN_Q2 = { id: "Q2", severity: "Blocking" as const, question: "Is a pinned entry pruned?", impact: "BR-01", options: ["No", "Yes"] };
export const DECIDED_Q1 = { id: "Q1", question: "Does a prune with no cut-off refuse?", answer: "Refuse", date: "2026-10-24" };

/** The ids and statements of the valid answer. */
export const SPEC_IDS = [
  ["UC-01", "remove the entries saved before a cut-off"], ["BR-01", "a feedback entry stays whatever its age"],
];
