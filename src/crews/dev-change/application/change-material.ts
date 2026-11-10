// The change writer's prompts, assembled for one extract call each: the brief's head, then its material cut to the
// room the cap leaves - past the cap the current file is cut first, then the origin, then the inventory - and the
// reproduction prompt with its origin cut. The text is ./prompts.ts's.
import type { Decision } from "../../../shared/domain/dev/questions.ts";
import type { ChangeKind } from "../../../shared/domain/dev/spec-format.ts";
import { NO_INVENTORY, changePromptHead, changePromptMaterial, cutByCode, reproPrompt } from "./prompts.ts";
import type { ChangePromptMode } from "./prompts.ts";

export interface ChangePromptInput {
  mode: ChangePromptMode; code: string; kind: ChangeKind;
  origin: string; facts: string; request: string; current: string;
  decisions: readonly Decision[]; fresh: readonly Decision[]; inventory: string;
  /** The "## Precedents" block the step recalled (T1), "" or absent when none: material, placed last. */
  precedents?: string;
}

const MAX_CHANGE_PROMPT_CHARS = 60_000;
const MIN_PART = 2_000;
/** The most of the origin the reproduction prompt carries. */
const MAX_REPRO_ORIGIN_CHARS = 12_000;

function cut(text: string, max: number): string {
  return text.length <= max ? text : cutByCode(text.slice(0, Math.max(0, max - 20)));
}

export function buildChangePrompt(input: ChangePromptInput, problems: readonly string[]): string {
  const head = changePromptHead(input.code, input.kind, input.mode, problems, input.decisions, input.fresh);
  const precedents = (input.precedents ?? "").trimEnd();
  let room = MAX_CHANGE_PROMPT_CHARS - head.join("\n").length - input.facts.length - precedents.length - 400;
  const inventory = cut(input.inventory.trimEnd() || NO_INVENTORY, Math.max(MIN_PART, Math.floor(room / 4)));
  room -= inventory.length;
  const origin = cut(input.origin.trim(), Math.max(MIN_PART, Math.floor(room / 3)));
  room -= origin.length;
  const current = cut(input.current.trimEnd(), Math.max(MIN_PART, room));
  const material = changePromptMaterial({
    current, origin, request: input.request.trim(), facts: input.facts.trim(), inventory, precedents,
  });
  return [...head, ...material].join("\n");
}

/** The prompt asking for the one command that shows the bug or measures the cost. */
export function buildReproPrompt(kind: "bug" | "perf", origin: string, commands: readonly string[], problems: readonly string[]): string {
  return reproPrompt(kind, cut(origin.trim(), MAX_REPRO_ORIGIN_CHARS), commands, problems);
}
