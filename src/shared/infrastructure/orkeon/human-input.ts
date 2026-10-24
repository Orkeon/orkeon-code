// HumanInput adapter: human_input (RT-08) as the dev steps ask it. No answer is ever made on the person's behalf:
// every `choice` and `text` carries a default value no option holds, so whichever unattended provider answers (the
// auto-approver returns the default, the observed runner returns it when nobody replies) is read as "nobody
// answered", `was_default` or not; a `multi` gets no recommended option and a first option meaning "decide later",
// which the auto-approver picks and nobody else needs to. A host without the tool, or a call that throws, is
// nobody answering too. In the REPL an empty answer to a `choice` takes the recommended option (the person pressed
// Enter); an empty `text` is no answer.
import type { HumanInput } from "../../application/ports.ts";
import { pick } from "./tool-results.ts";

/** The default value no option holds: an answer equal to it came from no person. */
export const NO_ANSWER = "(no answer)";
/** The first option of a `multi`: picked by the auto-approver, it decides nothing. */
export const DECIDE_LATER = "Decide later";

type HumanInputTools = Partial<Pick<OrkeonTools, "humanInput">>;
const NOBODY = { answered: false } as const;

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function valuesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function createHumanInput(tools: HumanInputTools): HumanInput {
  const ask = async (input: Parameters<OrkeonTools["humanInput"]>[0]): Promise<unknown> => {
    if (typeof tools.humanInput !== "function") return null;
    try {
      return await tools.humanInput(input);
    } catch {
      return null;
    }
  };
  return {
    async choice(prompt, options) {
      const r = await ask({ prompt, input_type: "choice", choices: [...options], recommended: 0, default_value: NO_ANSWER });
      if (r === null) return NOBODY;
      const value = textOf(pick(r, "response", "Response"));
      if (pick(r, "was_default", "WasDefault") === true || value === NO_ANSWER || !options.includes(value)) return NOBODY;
      return { answered: true, value };
    },
    async text(prompt) {
      const r = await ask({ prompt, input_type: "text", default_value: NO_ANSWER });
      if (r === null) return NOBODY;
      const value = textOf(pick(r, "response", "Response")).trim();
      if (pick(r, "was_default", "WasDefault") === true || value === NO_ANSWER || value === "") return NOBODY;
      return { answered: true, value };
    },
    async multi(prompt, options) {
      const r = await ask({ prompt, input_type: "multi", choices: [DECIDE_LATER, ...options] });
      if (r === null) return NOBODY;
      const picked = valuesOf(pick(r, "values", "Values"));
      if (picked.length === 0 || picked.includes(DECIDE_LATER)) return NOBODY;
      return { answered: true, values: options.filter((o) => picked.includes(o)) };
    },
  };
}
