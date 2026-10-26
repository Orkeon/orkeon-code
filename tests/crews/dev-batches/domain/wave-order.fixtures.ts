// Batch nodes for the waveOrder and nextBatch tests.
import type { BatchNode } from "../../../../src/crews/dev-batches/domain/wave-order.ts";

/** A batch node: no dependency and not done unless told. */
export const node = (id: string, dependsOn: string[] = [], done = false): BatchNode => ({ id, dependsOn, done });

/** Plans waveOrder refuses, each named by what is wrong. */
export const REFUSED_PLANS: readonly { name: string; nodes: BatchNode[] }[] = [
  { name: "refuses a dependency on a batch the plan does not hold", nodes: [node("F1", ["F9"])] },
  { name: "refuses a dependency of a batch on itself", nodes: [node("F1", ["F1"])] },
  { name: "refuses a cycle", nodes: [node("F1", ["F2"]), node("F2", ["F1"])] },
];

/** F1 done, F2 depends on it, F3 free. */
export const F1_DONE_PLAN: readonly BatchNode[] = [node("F1", [], true), node("F2", ["F1"]), node("F3")];
