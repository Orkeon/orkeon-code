// Checks on the reviewer's brief: no prompt marker in the material.
import { ok } from "node:assert";

/** No prompt marker matches `text`. */
export function assertNoMarker(text: string, markers: readonly RegExp[], label: string): void {
  for (const marker of markers) ok(!marker.test(text), `${label}: ${marker}`);
}
