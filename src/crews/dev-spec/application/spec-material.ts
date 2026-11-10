// The spec writer's prompt, assembled for one extract call: the head (instructions, mode, problems, decisions), then
// the material cut to the room the cap leaves - past the cap the current file is cut first, then the request, then
// the inventory. The text is ./prompts.ts's.
import type { Decision } from "../../../shared/domain/dev/questions.ts";
import { NO_INVENTORY, cutByCode, specPromptHead, specPromptMaterial } from "./prompts.ts";
import type { SpecPromptMode } from "./prompts.ts";

export interface SpecPromptInput {
  mode: SpecPromptMode;
  code: string;
  /** The brief of a new spec, or the request typed after the code on a revision; "" when none. */
  request: string;
  /** The spec as it is on disk (revision) or as just written (fold); "" for a draft. */
  current: string;
  decisions: readonly Decision[];
  /** The decisions of this run, which a fold writes into the body. */
  fresh: readonly Decision[];
  inventory: string;
  /** The "## Precedents" block the step recalled (T1), "" or absent when none: material, placed last. */
  precedents?: string;
}

const MAX_SPEC_PROMPT_CHARS = 60_000;
const MIN_PART = 2_000;

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  return cutByCode(text.slice(0, Math.max(0, max - 20)));
}

export function buildSpecPrompt(input: SpecPromptInput, problems: readonly string[]): string {
  const head = specPromptHead(input.code, input.mode, problems, input.decisions, input.fresh);
  const precedents = (input.precedents ?? "").trimEnd();
  const fixed = head.join("\n").length + precedents.length + 400;
  let room = MAX_SPEC_PROMPT_CHARS - fixed;
  const inventory = cut(input.inventory.trimEnd() || NO_INVENTORY, Math.max(MIN_PART, Math.floor(room / 4)));
  room -= inventory.length;
  const request = cut(input.request.trim(), Math.max(MIN_PART, Math.floor(room / 3)));
  room -= request.length;
  const current = cut(input.current.trimEnd(), Math.max(MIN_PART, room));
  return [...head, ...specPromptMaterial(input.mode, current, request, inventory, precedents)].join("\n");
}
