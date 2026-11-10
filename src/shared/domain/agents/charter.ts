// A sub-agent's charter: who it is, the mode it acts in, the tools it may be
// offered and how many tool-call iterations it gets. Pure, no IO. For now a
// sub-agent acts read-only: its catalogue is the mode's own (no session rule
// applies yet), narrowed to the charter's list.

import type { PermissionMode } from "../permission-modes.ts";
import { catalogueFor } from "../agent-policy/permission.ts";
import { policyFor } from "../agent-policy/mode-policy.ts";
import {
  charterIterations, charterModeCanWrite, charterNameNotKebab, charterNoToolLeft, charterToolNotOffered,
} from "./messages.ts";

/** A check's outcome: the value, or what is wrong with it. */
export type Checked<T> = { ok: true; value: T } | { ok: false; problems: string[] };

/** What a sub-agent is: its identity, its mode, the tools it may be offered, its iteration cap. */
export interface Charter {
  name: string;
  role: string;
  goal: string;
  mode: PermissionMode;
  tools: readonly string[];
  disallowed: readonly string[];
  maxIterations: number;
  /** The model to answer with; the host's when absent. */
  model?: string;
}

export const CHARTER_NAME: RegExp = /^[a-z][a-z0-9-]{1,39}$/;
export const MAX_CHARTER_ITERATIONS = 80;
/** The longest brief a sub-agent is handed, in characters (temp/03 § A "MAX_BRIEF_CHARS"). */
export const MAX_BRIEF_CHARS = 24_000;

function offeredIn(mode: string): string[] {
  return catalogueFor(mode, []).tools;
}

/** catalogueFor(mode, []).tools ∩ charter.tools − charter.disallowed, in the order of charter.tools. */
export function charterCatalogue(charter: Charter): string[] {
  const offered = new Set(offeredIn(charter.mode));
  const disallowed = new Set(charter.disallowed);
  return charter.tools.filter((t) => offered.has(t) && !disallowed.has(t));
}

/** Empty when the charter can run. */
export function charterProblems(charter: Charter): string[] {
  const { name, mode, maxIterations } = charter;
  const problems: string[] = [];
  if (!CHARTER_NAME.test(name)) problems.push(charterNameNotKebab(name));
  if (!policyFor(mode).readOnly) {
    problems.push(charterModeCanWrite(name, mode));
  }
  const offered = new Set(offeredIn(mode));
  for (const tool of charter.tools) {
    if (!offered.has(tool)) problems.push(charterToolNotOffered(name, tool, mode));
  }
  if (charterCatalogue(charter).length === 0) {
    problems.push(charterNoToolLeft(name));
  }
  if (!(Number.isInteger(maxIterations) && maxIterations >= 1 && maxIterations <= MAX_CHARTER_ITERATIONS)) {
    problems.push(charterIterations(name, maxIterations));
  }
  return problems;
}
