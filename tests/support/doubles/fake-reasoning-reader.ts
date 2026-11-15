// FakeReasoningReader: the ReasoningReader port answering from plain fields. `capabilitiesAnswer` is what a model
// takes (null: the host cannot tell); `reports` is what a level becomes, by level (a level left out: null);
// `hostReport` is what the host's own configuration sends when no level is asked (null: it asks for none).
// `byProfile` answers for a target on that profile instead, and `byModel` for a target on no profile whose model it
// holds ("" the host's own model), each entry as it stands (its null capabilities included). Every target asked
// lands in `targets`, every level asked of `effort` in `levelsAsked`.
import type { ReasoningReader } from "../../../src/shared/application/ports.ts";
import type { EffortLevel } from "../../../src/shared/domain/agent-policy/behavior-flags.ts";
import type { EffortReport, ReasoningCapabilities, ReasoningTarget } from "../../../src/shared/domain/agent-policy/reasoning.ts";

/** What the fake answers for one profile or model. */
export interface ReasoningAnswers {
  capabilities: ReasoningCapabilities | null;
  reports: Partial<Record<EffortLevel, EffortReport>>;
  /** With no level asked; absent: none. */
  hostReport?: EffortReport | null;
}

export class FakeReasoningReader implements ReasoningReader {
  capabilitiesAnswer: ReasoningCapabilities | null = null;
  reports: Partial<Record<EffortLevel, EffortReport>> = {};
  hostReport: EffortReport | null = null;
  byProfile: Record<string, ReasoningAnswers> = {};
  byModel: Record<string, ReasoningAnswers> = {};
  targets: ReasoningTarget[] = [];
  levelsAsked: Array<EffortLevel | null> = [];

  capabilities(target: ReasoningTarget): ReasoningCapabilities | null {
    this.targets.push(target);
    return this.answersFor(target).capabilities;
  }

  effort(target: ReasoningTarget, level: EffortLevel | null): EffortReport | null {
    this.targets.push(target);
    this.levelsAsked.push(level);
    const answers = this.answersFor(target);
    return level === null ? answers.hostReport ?? null : answers.reports[level] ?? null;
  }

  private answersFor(target: ReasoningTarget): ReasoningAnswers {
    const own = target.profile === null ? this.byModel[target.model] : this.byProfile[target.profile];
    return own ?? { capabilities: this.capabilitiesAnswer, reports: this.reports, hostReport: this.hostReport };
  }
}
