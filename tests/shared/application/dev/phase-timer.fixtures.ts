// A phase timer over a FakeClock moving a known step at each read, and the error a failing step throws.
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { PhaseTimer } from "../../../../src/shared/application/dev/phase-timer.ts";

/** A timer whose clock moves `tickMs` at each read after the first, and the model it may wrap. */
export function tickingTimer(tickMs = 1_000) {
  const clock = new FakeClock();
  clock.tickMs = tickMs;
  return { clock, timer: new PhaseTimer(clock.now), llm: new FakeLlm() };
}

export const BOOM = new Error("the provider failed");

export const READ_REQUEST = { permissionMode: "plan", maxIterations: 1 };
