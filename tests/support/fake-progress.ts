// FakeProgress: the Progress port recording every report and every released label, in order.
import type { Progress, ProgressSpec } from "../../src/shared/application/ports.ts";

export class FakeProgress implements Progress {
  reports: ProgressSpec[] = [];
  released: string[] = [];

  async report(spec: ProgressSpec): Promise<void> {
    this.reports.push(spec);
  }

  async done(label: string): Promise<void> {
    this.released.push(label);
  }
}
