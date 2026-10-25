// Texts a brief carries, for the carriedBlocks tests.
import type { CarriedText } from "./carried-text.ts";

/** A sheet with trailing blank lines, then a diff: both fit any room the tests give. */
export const SHEET_THEN_DIFF: readonly CarriedText[] = [
  { title: "workbench/x/X-PLAN-F2.md", text: "# F2\n\nbody\n\n" },
  { title: "what F1 changed", text: "diff --git a b" },
];

/** Their blocks: each text fenced under its title, the sheet's trailing blank lines dropped. */
export const SHEET_THEN_DIFF_BLOCKS: readonly string[] = [
  "### workbench/x/X-PLAN-F2.md\n```text\n# F2\n\nbody\n```",
  "### what F1 changed\n```text\ndiff --git a b\n```",
];

/** A short text, a long one past a room of 1 000 characters, then one no room is left for. */
export const SHORT_LONG_AFTER: readonly CarriedText[] = [
  { title: "a", text: "short" },
  { title: "b", text: "x".repeat(5_000) },
  { title: "c", text: "after" },
];

export const ONE_SHORT_TEXT: readonly CarriedText[] = [{ title: "a", text: "short" }];
