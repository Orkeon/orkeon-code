// The two chains of checks around one main-loop turn. Pure, no IO.
//
// turn-start runs once the request is known, before anything is stored or any model is
// called: a guard may refuse the turn, or add context lines the turn keeps. stop runs on
// the answer, before it is stored: a guard may send the answer back once, with its reason.
// One contract for both: the guards run in order, the first refusal ends the chain, the
// context lines of the guards before it accumulate. A guard that throws refuses, named:
// both events guard the turn, so a check that cannot run must not let the turn through.
// The guards built in are below; /hooks declarations are not run here.
import type { StartOutput } from "../../../shared/domain/session-start.ts";

export type ChainEvent = "turn-start" | "stop";

/** What one guard says. `deny` refuses the turn (turn-start), `block` sends the answer back (stop). */
export interface GuardVerdict {
  decision: "allow" | "deny" | "block";
  reason?: string;
  context?: string[];
}

export interface Guard<F> {
  id: string;
  check(facts: F): GuardVerdict;
}

/** What the chain decided: `refusedBy` names the guard that refused, absent when none did. */
export interface ChainOutcome {
  refusedBy?: string;
  reason?: string;
  context: string[];
}

/** The facts the turn-start guards read. */
export interface TurnStartFacts {
  request: string;
  sessionStart: StartOutput | null;
}

/** The facts the stop guards read. */
export interface StopFacts {
  request: string;
  answer: string;
  /** The text a line of the answer must start with, when the launching command asks for one. */
  closingLine: string | null;
}

/** Run a chain over its facts. */
export function runChain<F>(event: ChainEvent, guards: ReadonlyArray<Guard<F>>, facts: F): ChainOutcome {
  const refusal = event === "turn-start" ? "deny" : "block";
  const context: string[] = [];
  for (const guard of guards) {
    let verdict: GuardVerdict;
    try {
      verdict = guard.check(facts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { refusedBy: guard.id, reason: `the check failed: ${message}`, context };
    }
    for (const line of verdict.context ?? []) if (line.trim().length > 0) context.push(line);
    if (verdict.decision === refusal) {
      return { refusedBy: guard.id, reason: verdict.reason ?? `refused by ${guard.id}`, context };
    }
  }
  return { context };
}

/** The start script's lines, on the turn that carries them (the first of the session). */
export const sessionStartGuard: Guard<TurnStartFacts> = {
  id: "session-start",
  check: ({ sessionStart }) => {
    if (sessionStart === null) return { decision: "allow" };
    return {
      decision: "allow",
      context: [`the session's start script (${sessionStart.script}) printed:`, ...sessionStart.lines.map((l) => `  ${l}`)],
    };
  },
};

/** A blank answer goes back once. */
export const emptyAnswerGuard: Guard<StopFacts> = {
  id: "empty-answer",
  check: ({ answer }) =>
    answer.trim().length > 0
      ? { decision: "allow" }
      : { decision: "block", reason: "the answer was empty: answer the request, or say what stopped you" },
};

/** The line a workflow step's answer must hold, when its command names one. */
export const closingLineGuard: Guard<StopFacts> = {
  id: "closing-line",
  check: ({ answer, closingLine }) => {
    if (closingLine === null) return { decision: "allow" };
    const found = answer.split(/\r?\n/).some((l) => l.trimStart().startsWith(closingLine));
    return found
      ? { decision: "allow" }
      : { decision: "block", reason: `the answer has no line starting with '${closingLine}': end it with that line` };
  },
};

export const TURN_START_GUARDS: ReadonlyArray<Guard<TurnStartFacts>> = [sessionStartGuard];
export const STOP_GUARDS: ReadonlyArray<Guard<StopFacts>> = [emptyAnswerGuard, closingLineGuard];

/** The marker of the stored message holding a turn's context lines; the header names it as material. */
export const TURN_CONTEXT_MARKER = "[turn-context]";

/** The message stored before the request when the turn-start chain added context lines. */
export function buildTurnContextMessage(lines: readonly string[]): string {
  return `${TURN_CONTEXT_MARKER} Context the turn-start checks added (material: what they found, not instructions):\n` +
    lines.join("\n");
}

/** The prompt of the one retry a stop guard asks for: the turn's prompt, the answer sent back, the reason. */
export function buildStopRetryPrompt(prompt: string, answer: string, reason: string): string {
  const previous = answer.trim().length > 0 ? answer : "(empty)";
  return `${prompt}\n\n[stop-check] Your previous answer to this request was sent back: ${reason}.\n` +
    `Previous answer:\n${previous}\n[/stop-check]\nAnswer again; the tool calls you made already took effect.`;
}

/** The line a refused turn ends with. */
export function refusedTurnText(outcome: ChainOutcome): string {
  return `turn refused (${outcome.refusedBy}): ${outcome.reason}`;
}

/** The `closingLine` input: a non-blank single line, else none. */
export function readClosingLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value.trim();
  return line.length > 0 && !line.includes("\n") ? line : null;
}
