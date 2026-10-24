// The order /dev-batches runs a plan's batches in: each after the batches it depends on, ties by
// batch number. A batch's dependencies are its summary row's `Depends on`, else its sheet's. An
// unknown dependency or a cycle refuses the plan. Pure.
import { compareBatchIds } from "../../../shared/domain/dev/artefacts.ts";

export interface BatchNode {
  id: string;
  dependsOn: readonly string[];
  done: boolean;
}

export type WaveOrder = { ok: true; order: string[] } | { ok: false; problem: string };

/** Kahn's order over the batches; the smallest batch number first among those ready. */
export function waveOrder(batches: readonly BatchNode[]): WaveOrder {
  const ids = new Set(batches.map((b) => b.id));
  const unknown: string[] = [];
  for (const b of batches) {
    for (const d of b.dependsOn) if (!ids.has(d)) unknown.push(`${b.id} depends on ${d}`);
  }
  if (unknown.length > 0) return { ok: false, problem: `unknown dependency: ${unknown.join(", ")}` };
  const left = new Map(batches.map((b) => [b.id, new Set(b.dependsOn.filter((d) => d !== b.id))]));
  const self = batches.filter((b) => b.dependsOn.includes(b.id)).map((b) => b.id);
  if (self.length > 0) return { ok: false, problem: `a batch depends on itself: ${self.join(", ")}` };
  const order: string[] = [];
  while (left.size > 0) {
    const ready = [...left].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort(compareBatchIds);
    if (ready.length === 0) {
      return { ok: false, problem: `the dependencies form a cycle: ${[...left.keys()].sort(compareBatchIds).join(", ")}` };
    }
    const next = ready[0];
    order.push(next);
    left.delete(next);
    for (const deps of left.values()) deps.delete(next);
  }
  return { ok: true, order };
}

/** The first batch of the order not done; null when every batch is. */
export function nextBatch(order: readonly string[], batches: readonly BatchNode[]): string | null {
  const done = new Set(batches.filter((b) => b.done).map((b) => b.id));
  return order.find((id) => !done.has(id)) ?? null;
}
