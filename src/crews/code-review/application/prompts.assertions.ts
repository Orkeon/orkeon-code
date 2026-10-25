// Checks on the review-lens prompt.
import { ok } from "node:assert";

/** `text` holds none of `needles`; `why` says why each must stay out. */
export function assertOmits(text: string, needles: readonly string[], why = "it must not be there"): void {
  for (const needle of needles) ok(!text.includes(needle), `${JSON.stringify(needle)} found (${why}) in:\n${text}`);
}
