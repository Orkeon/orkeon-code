// FakeReasoningReader: the ReasoningReader port answering from plain fields. `capabilitiesAnswer` is what every
// model takes (null: the host cannot tell); `reports` is what a level becomes, by level (a level left out: null).
// Every target asked lands in `targets`.
import type { ReasoningReader } from "../../../src/shared/application/ports.ts";
import type { EffortLevel } from "../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { EffortReport, ReasoningCapabilities, ReasoningTarget } from "../../../src/shared/domain/agent-policy/reasoning.ts";

export class FakeReasoningReader implements ReasoningReader {
  capabilitiesAnswer: ReasoningCapabilities | null = null;
  reports: Partial<Record<EffortLevel, EffortReport>> = {};
  targets: ReasoningTarget[] = [];

  capabilities(target: ReasoningTarget): ReasoningCapabilities | null {
    this.targets.push(target);
    return this.capabilitiesAnswer;
  }

  effort(target: ReasoningTarget, level: EffortLevel): EffortReport | null {
    this.targets.push(target);
    return this.reports[level] ?? null;
  }
}
