// What a model takes for reasoning and what becomes of an effort asked, as the runtime judges them (Orkeon #359,
// #360): the capability table of the host, the provider's own levels, the model's entry. Nothing here repeats that
// rule: these are the shapes the runtime answers with, read from whatever object it hands over. Pure.
import { isEffortLevel } from "./behavior-flags.ts";
import type { EffortLevel } from "./behavior-flags.ts";

/** What the session's turns run on: the session's `llm.profile`, else the /model override, else the host's own
 *  model. A profile wins over the model, as it does in the main loop. */
export interface ReasoningTarget {
  profile: string | null;
  model: string;
}

export const THINKING_SUPPORTS = ["none", "effortOnly", "toggle", "budget"] as const;
export type ThinkingSupport = (typeof THINKING_SUPPORTS)[number];

/** What a provider and one of its models take for reasoning. */
export interface ReasoningCapabilities {
  model: string;
  /** Whether the capability table knows the model; when it does not, an effort is sent unchecked. */
  known: boolean;
  thinking: ThinkingSupport;
  /** The levels sent as asked, in order; empty when the model takes no effort. */
  efforts: readonly EffortLevel[];
}

export const EFFORT_NOTICES = ["lowered", "dropped", "unchecked"] as const;
export type EffortNotice = (typeof EFFORT_NOTICES)[number];

/** What the runtime does with an effort asked. */
export interface EffortReport {
  model: string;
  asked: EffortLevel;
  /** What the provider receives; null when no effort goes out. */
  sent: string | null;
  /** Null when the effort goes as asked on a model the table knows. */
  notice: EffortNotice | null;
}

function fieldsOf(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

/** The capabilities the runtime answered; null when it answered none, or something that names no model. */
export function capabilitiesOf(raw: unknown): ReasoningCapabilities | null {
  const fields = fieldsOf(raw);
  if (fields === null || typeof fields.model !== "string") return null;
  const thinking = THINKING_SUPPORTS.find((support) => support === fields.thinking) ?? "none";
  const efforts = Array.isArray(fields.efforts) ? fields.efforts.filter((level): level is EffortLevel => isEffortLevel(level)) : [];
  return { model: fields.model, known: fields.known === true, thinking, efforts };
}

/** The report the runtime answered; null when it answered none (no effort asked, no provider), or one whose asked
 *  level is not a level. */
export function effortReportOf(raw: unknown): EffortReport | null {
  const fields = fieldsOf(raw);
  if (fields === null || typeof fields.model !== "string" || !isEffortLevel(fields.asked)) return null;
  return {
    model: fields.model,
    asked: fields.asked,
    sent: typeof fields.sent === "string" ? fields.sent : null,
    notice: EFFORT_NOTICES.find((notice) => notice === fields.notice) ?? null,
  };
}
