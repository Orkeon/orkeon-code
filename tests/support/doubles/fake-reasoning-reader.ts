// FakeReasoningReader: the ReasoningReader port answering from plain fields. `capabilitiesAnswer` is what every
// model takes (null: the host cannot tell); `reports` is what a level becomes, by level (a level left out: null).
// `byProfile` answers for a target on that profile instead, when it holds it. Every target asked lands in `targets`.
import type { ReasoningReader } from "../../../src/shared/application/ports.ts";
import type { EffortLevel } from "../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { EffortReport, ReasoningCapabilities, ReasoningTarget } from "../../../src/shared/domain/agent-policy/reasoning.ts";

export class FakeReasoningReader implements ReasoningReader {
  capabilitiesAnswer: ReasoningCapabilities | null = null;
  reports: Partial<Record<EffortLevel, EffortReport>> = {};
  byProfile: Record<string, { capabilities: ReasoningCapabilities | null; reports: Partial<Record<EffortLevel, EffortReport>> }> = {};
  targets: ReasoningTarget[] = [];

  capabilities(target: ReasoningTarget): ReasoningCapabilities | null {
    this.targets.push(target);
    return (target.profile === null ? undefined : this.byProfile[target.profile])?.capabilities ?? this.capabilitiesAnswer;
  }

  effort(target: ReasoningTarget, level: EffortLevel): EffortReport | null {
    this.targets.push(target);
    const own = target.profile === null ? undefined : this.byProfile[target.profile];
    return (own === undefined ? this.reports : own.reports)[level] ?? null;
  }
}
