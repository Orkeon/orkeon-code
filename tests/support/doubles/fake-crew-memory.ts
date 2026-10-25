// FakeCrewMemory: the CrewMemory port over a Map; `stored` holds what was kept, by key.
import type { CrewMemory } from "../../../src/shared/application/ports.ts";

export class FakeCrewMemory implements CrewMemory {
  stored = new Map<string, unknown>();

  async store(key: string, value: unknown): Promise<void> {
    this.stored.set(key, value);
  }
}
