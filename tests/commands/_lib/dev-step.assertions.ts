// Checks on what startDevStep returns.
import { ok } from "node:assert";
import type { DevStepStart } from "../../../src/commands/_lib/dev-step.ts";

/** The step started: it was not refused. */
export function assertStarted(start: DevStepStart): asserts start is Extract<DevStepStart, { ok: true }> {
  ok(start.ok, `the step was refused: ${start.ok ? "" : start.line}`);
}
