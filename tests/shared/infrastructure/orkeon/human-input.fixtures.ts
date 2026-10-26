// The stand-in of tools.humanInput the createHumanInput tests drive, and the replies read as nobody answering.
import { DECIDE_LATER, NO_ANSWER, createHumanInput } from "../../../../src/shared/infrastructure/orkeon/human-input.ts";

type HumanInput = ReturnType<typeof createHumanInput>;

/** A humanInput tool answering `reply` (or throwing it) and recording each input, and the adapter built over it. */
export function stub(reply: unknown | Error) {
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

export interface NobodyCase {
  name: string;
  /** The adapter, built over what the runtime provider returns. */
  human: () => HumanInput;
}

/** A choice between "A" and "B" that nobody answered. */
export const CHOICE_NOBODY: readonly NobodyCase[] = [
  { name: "reads the auto-approver's default as nobody", human: () => stub({ response: NO_ANSWER, was_default: true }).human },
  { name: "reads the observed runner's default as nobody", human: () => stub({ response: NO_ANSWER }).human },
  { name: "reads a value outside the options as nobody", human: () => stub({ response: "C" }).human },
  { name: "reads a throw as nobody", human: () => stub(new Error("no tty")).human },
  { name: "reads a host without the tool as nobody", human: () => createHumanInput({}) },
];

/** A text question that nobody answered. */
export const TEXT_NOBODY: readonly NobodyCase[] = [
  { name: "reads an empty text as nobody", human: () => stub({ response: "" }).human },
  { name: "reads the default text as nobody", human: () => stub({ response: NO_ANSWER, was_default: true }).human },
];

/** A multi selection over ["m1"] that decides nothing. */
export const MULTI_NOBODY: readonly NobodyCase[] = [
  { name: "reads 'Decide later' as deciding nothing", human: () => stub({ values: [DECIDE_LATER] }).human },
  { name: "reads an empty selection as deciding nothing", human: () => stub({ values: [] }).human },
];
