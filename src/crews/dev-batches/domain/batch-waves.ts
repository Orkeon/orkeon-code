// The waves a parallel /dev-batches would run a plan's open batches in: a wave holds the batches whose
// dependencies are done or in an earlier wave, taken by batch number, each kept only when the paths its
// sheet anchors are disjoint from those of the batches already in the wave; one left out waits for the
// next wave. A batch that anchors no path cannot be shown disjoint and runs alone. An unknown dependency
// or a cycle refuses the plan, as the sequential order does (wave-order.ts). Pure.
//
// A parallel /dev-batches (`--concurrency n`, n from 2) runs the first wave, at most n of it, each batch under its
// own worktree (application/run-wave.ts).
import { compareBatchIds } from "../../../shared/domain/dev/artefacts.ts";
import { anchorRefs, parseImplementSheet } from "../../dev-implement/domain/step-section.ts";
import { waveOrder } from "./wave-order.ts";

export interface WaveBatch {
  id: string;
  dependsOn: readonly string[];
  /** The paths its sheet's `## Anchors` names (any column), as written. */
  anchors: readonly string[];
  done: boolean;
}

export type Waves = { ok: true; waves: string[][] } | { ok: false; problem: string };

/** A path as compared: `./` and a trailing `:<line>` cut. */
export function barePath(path: string): string {
  return path.trim().replace(/^(\.\/)+/, "").replace(/:\d+$/, "");
}

/** The paths of a sheet's `## Anchors`: its test, doubles and production columns, bare, unique, sorted. A doubles
 *  part's note in parentheses (`(\`writes\` to add)`) names a member, not a path. */
export function sheetAnchorPaths(sheet: string): string[] {
  const out = new Set<string>();
  for (const step of parseImplementSheet(sheet).steps) {
    if (step.anchor === null) continue;
    const doubles = step.anchor.doubles.split(";").flatMap((part) => anchorRefs(part.split("(")[0]));
    for (const ref of [...step.anchor.testFiles, ...step.anchor.production, ...doubles]) {
      const path = barePath(ref.path);
      if (path !== "") out.add(path);
    }
  }
  return [...out].sort();
}

/** The open batches in waves; done batches count as met dependencies and are in no wave. */
export function batchWaves(batches: readonly WaveBatch[]): Waves {
  const order = waveOrder(batches.map((b) => ({ id: b.id, dependsOn: b.dependsOn, done: b.done })));
  if (!order.ok) return order;
  const met = new Set(batches.filter((b) => b.done).map((b) => b.id));
  const left = batches.filter((b) => !b.done).sort((a, b) => compareBatchIds(a.id, b.id));
  const waves: string[][] = [];
  while (left.length > 0) {
    const ready = left.filter((b) => b.dependsOn.every((d) => met.has(d)));
    // waveOrder refused cycles: something is always ready.
    const wave: WaveBatch[] = [];
    const taken = new Set<string>();
    for (const b of ready) {
      const paths = b.anchors.map(barePath).filter((p) => p !== "");
      const alone = paths.length === 0;
      if (wave.length > 0 && (alone || paths.some((p) => taken.has(p)))) continue;
      wave.push(b);
      for (const p of paths) taken.add(p);
      if (alone) break;
    }
    waves.push(wave.map((b) => b.id));
    for (const b of wave) {
      met.add(b.id);
      left.splice(left.indexOf(b), 1);
    }
  }
  return { ok: true, waves };
}
