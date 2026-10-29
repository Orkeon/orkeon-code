// FakeRunningCrews: the RunningCrews port. `tickets` maps a crew's name to the tickets of its running
// instances; a crew it does not name runs nothing; every crew asked about lands in `asked`.
import type { RunningCrew, RunningCrews } from "../../../src/shared/application/ports.ts";

export class FakeRunningCrews implements RunningCrews {
  tickets: Record<string, string[]> = {};
  asked: string[] = [];

  running(crew: string): RunningCrew[] {
    this.asked.push(crew);
    return (this.tickets[crew] ?? []).map((ticket) => ({ ticket }));
  }
}
