// The clock of a dev step's phases: each awaited step is timed with the Clock port and its time recorded under its
// phase (shared/domain/dev/phase-timing.ts), a step that throws included, its error rethrown. A step timed inside
// another counts for its own phase alone: the outer phase keeps the time its inner steps did not take. The line ends
// with `other`, what the run spent outside every phase.
import type { Clock, Llm } from "../ports.ts";
import { NO_TIMING, recordPhase, startPhase, timingLine, timingTotalMs } from "../../domain/dev/phase-timing.ts";
import type { PhaseTiming, RunUnit } from "../../domain/dev/phase-timing.ts";

/** The phase of what no step was timed under (the recall of precedents, the reads of the context). */
export const OTHER_PHASE = "other";

export class PhaseTimer {
  private readonly clock: Clock;
  private recorded: PhaseTiming = NO_TIMING;

  private readonly started: number;

  constructor(clock: Clock) {
    this.clock = clock;
    this.started = clock().getTime();
  }

  get timing(): PhaseTiming {
    return this.recorded;
  }

  /** The summary's timing line ("" when no time was spent): the phases, then `other`, the time since the timer was
   *  made that no phase took, so that the total is the run's own. */
  line(): string {
    const other = this.clock().getTime() - this.started - timingTotalMs(this.recorded);
    if (other <= 0) return timingLine(this.recorded);
    return timingLine(recordPhase(startPhase(this.recorded, OTHER_PHASE, "attempt"), OTHER_PHASE, other, "attempt"));
  }

  async time<T>(phase: string, step: () => Promise<T>, unit: RunUnit = "attempt"): Promise<T> {
    this.recorded = startPhase(this.recorded, phase, unit);
    const inner = timingTotalMs(this.recorded);
    const start = this.clock().getTime();
    try {
      return await step();
    } finally {
      const elapsed = this.clock().getTime() - start;
      this.recorded = recordPhase(this.recorded, phase, elapsed - (timingTotalMs(this.recorded) - inner), unit);
    }
  }

  /** `llm` with each extraction timed under `phase`: its act is left as it is. */
  timedExtract(llm: Pick<Llm, "act" | "extract">, phase: string): Pick<Llm, "act" | "extract"> {
    return {
      act: (prompt, request) => llm.act(prompt, request),
      extract: (prompt, schema) => this.time(phase, () => llm.extract(prompt, schema)),
    };
  }
}
