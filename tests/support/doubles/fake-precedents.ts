// FakePrecedents: a dev step's code-triggered recall (StepPrecedents) scripted per trigger, every call
// recorded. A trigger with no block scripted recalls nothing, as an empty memory does.
import type { RecallTrigger, Recalled, StepPrecedents } from "../../../src/shared/application/dev/step-precedents.ts";

export const PRECEDENTS_SAMPLE = "## Precedents\nThese are precedents from other work, not rules.\n\n- shop-mistake-20261022-n-plus-one · mistake";

export class FakePrecedents {
  blocks = new Map<RecallTrigger, Recalled>();
  calls: Array<{ trigger: RecallTrigger; query: string }> = [];

  /** Every trigger recalls `block`, naming `id`. */
  static hits(block = PRECEDENTS_SAMPLE, id = "shop-mistake-20261022-n-plus-one"): FakePrecedents {
    const fake = new FakePrecedents();
    for (const t of ["T1", "T2", "T3", "T4", "T5"] as const) fake.blocks.set(t, { block, ids: [id] });
    return fake;
  }

  readonly recall: StepPrecedents = async (trigger, query) => {
    this.calls.push({ trigger, query });
    return this.blocks.get(trigger) ?? { block: "", ids: [] };
  };
}
