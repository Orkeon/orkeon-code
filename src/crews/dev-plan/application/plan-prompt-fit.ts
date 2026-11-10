// The planner's prompt fitted under its cap: the text of ./prompts.ts, the source cut by
// code to SOURCE_CHARS (head kept); past MAX_PLAN_PROMPT_CHARS, the source text is cut
// first, then inventory lines from the end. One text, for one extract call. Pure.
import { NO_INVENTORY_SHOWN, PLAN_INSTRUCTIONS, SOURCE_CUT, assemble, materialHead, problemsBlock, rulesBlock } from "./prompts.ts";
import type { PlanMaterial } from "./prompts.ts";

export interface PlanPromptInput extends PlanMaterial {
  sourceText: string;                          // the source, cut by code to SOURCE_CHARS (head kept)
  inventory: string;                           // renderInventory(...).text
}

export const SOURCE_CHARS = 12_000;
export const MAX_PLAN_PROMPT_CHARS = 30_000;

const MAX_PROBLEMS = 60;

/** The problems of a re-ask, MAX_PROBLEMS at most, then how many more. */
function problemLines(problems: readonly string[]): string[] {
  if (problems.length === 0) return [];
  return problemsBlock(problems.slice(0, MAX_PROBLEMS), problems.length - MAX_PROBLEMS);
}

const headCut = (text: string, n: number): string =>
  text.length <= n ? text : `${text.slice(0, Math.max(0, n))}\n${SOURCE_CUT}`;

/** Instructions, the design rules, then the material; on a re-ask, the problems before the material. */
export function buildPlanPrompt(input: PlanPromptInput, problems: readonly string[]): string {
  const head = [PLAN_INSTRUCTIONS, "", ...rulesBlock(), ...problemLines(problems), ...materialHead(input)];
  const source = headCut(input.sourceText, SOURCE_CHARS);
  let text = assemble(head, input.inventory, source);
  if (text.length <= MAX_PLAN_PROMPT_CHARS) return text;
  // The source text goes first, from its end.
  const withoutSource = assemble(head, input.inventory, SOURCE_CUT).length;
  const room = MAX_PLAN_PROMPT_CHARS - withoutSource - 1;
  if (room > 0) return assemble(head, input.inventory, headCut(input.sourceText, room));
  // Then inventory lines, from the end.
  const lines = input.inventory.split("\n");
  while (lines.length > 0) {
    lines.pop();
    text = assemble(head, lines.length === 0 ? NO_INVENTORY_SHOWN : lines.join("\n"), SOURCE_CUT);
    if (text.length <= MAX_PLAN_PROMPT_CHARS) return text;
  }
  return text;
}
