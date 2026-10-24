// createHumanInput over a stub of tools.humanInput: what each runtime provider returns, read as a person's answer or
// as nobody answering - never a default answer. Run:  node --test src/shared/infrastructure/orkeon/human-input.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { DECIDE_LATER, NO_ANSWER, createHumanInput } from "./human-input.ts";

function stub(reply: unknown | Error) {
  const calls: any[] = [];
  const tools = {
    humanInput: async (input: any) => {
      calls.push(input);
      if (reply instanceof Error) throw reply;
      return reply as any;
    },
  };
  return { human: createHumanInput(tools as any), calls };
}

describe("createHumanInput — choice", () => {
  it("sends the recommended first and a sentinel default, and returns the option picked", async () => {
    const s = stub({ response: "B", was_default: false });
    deepStrictEqual(await s.human.choice("Q?", ["A", "B"]), { answered: true, value: "B" });
    deepStrictEqual(s.calls[0], { prompt: "Q?", input_type: "choice", choices: ["A", "B"], recommended: 0, default_value: NO_ANSWER });
  });

  it("reads the auto-approver's and the observed runner's default as nobody, and a value outside the options too", async () => {
    deepStrictEqual(await stub({ response: NO_ANSWER, was_default: true }).human.choice("Q?", ["A", "B"]), { answered: false });
    deepStrictEqual(await stub({ response: NO_ANSWER }).human.choice("Q?", ["A", "B"]), { answered: false });
    deepStrictEqual(await stub({ response: "C" }).human.choice("Q?", ["A", "B"]), { answered: false });
  });

  it("reads a throw and a host without the tool as nobody", async () => {
    deepStrictEqual(await stub(new Error("no tty")).human.choice("Q?", ["A", "B"]), { answered: false });
    deepStrictEqual(await createHumanInput({}).choice("Q?", ["A", "B"]), { answered: false });
  });
});

describe("createHumanInput — text and multi", () => {
  it("returns a typed text, and reads an empty one or the default as nobody", async () => {
    deepStrictEqual(await stub({ response: " yes " }).human.text("Q?"), { answered: true, value: "yes" });
    deepStrictEqual(await stub({ response: "" }).human.text("Q?"), { answered: false });
    deepStrictEqual(await stub({ response: NO_ANSWER, was_default: true }).human.text("Q?"), { answered: false });
  });

  it("adds 'Decide later' first with no recommended index; it, or an empty selection, decides nothing", async () => {
    const s = stub({ values: ["m2", "m1"] });
    deepStrictEqual(await s.human.multi("Pick", ["m1", "m2", "m3"]), { answered: true, values: ["m1", "m2"] });
    deepStrictEqual(s.calls[0], { prompt: "Pick", input_type: "multi", choices: [DECIDE_LATER, "m1", "m2", "m3"] });
    deepStrictEqual(await stub({ values: [DECIDE_LATER] }).human.multi("Pick", ["m1"]), { answered: false });
    deepStrictEqual(await stub({ values: [] }).human.multi("Pick", ["m1"]), { answered: false });
  });
});
