// FakeTelemetry: the Telemetry port answering the fields set on `metadata`,
// `cost` and `stats`; a `failure` makes every read throw it, as a host without
// the session tools does.
import type {
  SessionCost, SessionMetadata, SessionStats, Telemetry,
} from "../../../src/shared/application/ports.ts";

export class FakeTelemetry implements Telemetry {
  metadata: SessionMetadata = {};
  cost: SessionCost = {};
  stats: SessionStats = {};
  failure: Error | null = null;

  check(): void {
    if (this.failure) throw this.failure;
  }

  async readMetadata(): Promise<SessionMetadata> {
    this.check();
    return this.metadata;
  }

  async readCost(): Promise<SessionCost> {
    this.check();
    return this.cost;
  }

  async readStats(): Promise<SessionStats> {
    this.check();
    return this.stats;
  }
}
