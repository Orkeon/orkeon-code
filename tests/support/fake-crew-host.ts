// FakeCrewHost: the CrewHost port. `crews` is what listCrews answers; every launch
// lands in `launches` and gets the ticket `ticket-<n>`.
import type { CrewHost } from "../../src/shared/application/ports.ts";

export class FakeCrewHost implements CrewHost {
  crews: string[] = [];
  launches: Array<{ name: string; input: Record<string, unknown> }> = [];

  listCrews(): string[] {
    return [...this.crews];
  }

  launch(name: string, input: Record<string, unknown>): string {
    this.launches.push({ name, input });
    return `ticket-${this.launches.length}`;
  }
}
