// Checks on the reviewer's prompts: which pieces a text holds or leaves out.
import { ok } from "node:assert";

/** `text` holds each of `pieces`. */
export function assertHolds(text: string, pieces: readonly string[], label = "the text"): void {
  for (const piece of pieces) ok(text.includes(piece), `${label} lacks ${JSON.stringify(piece)}`);
}

/** `text` holds none of `pieces`. */
export function assertLacks(text: string, pieces: readonly string[], label = "the text"): void {
  for (const piece of pieces) ok(!text.includes(piece), `${label} holds ${JSON.stringify(piece)}`);
}

/** No prompt marker matches `text`. */
export function assertNoMarker(text: string, markers: readonly RegExp[], label: string): void {
  for (const marker of markers) ok(!marker.test(text), `${label}: ${marker}`);
}
