// Checks on the design rules.
import { ok, strictEqual } from "node:assert";
import type { DesignRule } from "../../../../src/shared/domain/dev/design-rules.ts";
import type { Marker } from "./design-rules.fixtures.ts";

/** Each rule sits in the family its id names. */
export function assertEachInItsFamily(rules: readonly DesignRule[]): void {
  for (const r of rules) strictEqual(r.family, r.id.split("-")[0], `${r.id}: family ${r.family}`);
}

/** Each rule fills its behaviour, appliesWhen and records, and keeps its behaviour within 200 characters. */
export function assertFieldsFilled(rules: readonly DesignRule[]): void {
  for (const r of rules) {
    for (const v of [r.behaviour, r.appliesWhen, r.records]) ok(v.trim() !== "", `${r.id}: an empty field`);
    ok(r.behaviour.length <= 200, `${r.id}: behaviour is ${r.behaviour.length} characters`);
  }
}

/** `text` matches none of the markers. */
export function assertNoMarker(text: string, markers: readonly Marker[]): void {
  for (const m of markers) ok(!new RegExp(m.source, m.flags).test(text), `marker ${m.source}`);
}
