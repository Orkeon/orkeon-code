// Checks on the judgements of the tool-call decision.
import { ok } from "node:assert";

import type { CallJudgement } from "./tool-call-policy.ts";

/** `judgement` refuses the call, its reason mentioning every text of `mentions`. */
export function assertRefused(judgement: CallJudgement, mentions: readonly string[]): void {
  const { verdict } = judgement;
  ok(typeof verdict === "object" && "deny" in verdict, `not a refusal: ${JSON.stringify(verdict)}`);
  for (const text of mentions) ok(verdict.deny.includes(text), `the refusal does not say "${text}": ${JSON.stringify(verdict)}`);
}

/** `judgement` refuses the call, its reason starting with `prefix`. */
export function assertRefusedWith(judgement: CallJudgement, prefix: string): void {
  const { verdict } = judgement;
  ok(typeof verdict === "object" && "deny" in verdict && verdict.deny.startsWith(prefix), `not a refusal starting "${prefix}": ${JSON.stringify(verdict)}`);
}
