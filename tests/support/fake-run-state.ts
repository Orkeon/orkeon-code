// FakeRunState: the RunState port over a plain record of fields.
import type { RunState } from "../../src/shared/application/ports.ts";

export class FakeRunState implements RunState {
  fields: Record<string, unknown> = {};

  read(field: string): unknown {
    return this.fields[field];
  }

  async write(field: string, value: unknown): Promise<void> {
    this.fields = { ...this.fields, [field]: value };
  }
}
