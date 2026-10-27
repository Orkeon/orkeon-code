// FakeCrewHost: the CrewHost port. `crews` is what listCrews answers; every launch
// lands in `launches` with its options when the caller gave some, and gets the ticket
// `ticket-<n>`; `onLaunch`, when set, is told of each launch before it lands, where a
// test notes the world at that moment; a `launchFailure` makes every launch throw it,
// before anything lands.
import type { CrewHost, CrewLaunchOptions } from "../../../src/shared/application/ports.ts";

export class FakeCrewHost implements CrewHost {
  crews: string[] = [];
  launches: Array<{ name: string; input: Record<string, unknown>; options?: CrewLaunchOptions }> = [];
  onLaunch: ((name: string, input: Record<string, unknown>) => void) | null = null;
  launchFailure: Error | null = null;

  listCrews(): string[] {
    return [...this.crews];
  }

  launch(name: string, input: Record<string, unknown>, options?: CrewLaunchOptions): string {
    if (this.launchFailure) throw this.launchFailure;
    this.onLaunch?.(name, input);
    this.launches.push(options === undefined ? { name, input } : { name, input, options });
    return `ticket-${this.launches.length}`;
  }
}
