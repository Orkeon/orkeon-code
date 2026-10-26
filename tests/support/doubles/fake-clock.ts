// FakeClock: the Clock port at a fixed instant (`at`, 2026-10-24T10:00:00Z by default), moved forward `tickMs` at
// each read after the first; `reads` counts the reads.
import type { Clock } from "../../../src/shared/application/ports.ts";

export class FakeClock {
  at = Date.parse("2026-10-24T10:00:00Z");
  tickMs = 0;
  reads = 0;

  now: Clock = () => new Date(this.at + this.tickMs * this.reads++);
}
