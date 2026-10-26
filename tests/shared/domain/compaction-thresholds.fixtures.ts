// Token counts and settings for the compaction threshold tests.

/** Windows that report nothing: the default window applies. */
export const UNREPORTED_WINDOWS: readonly number[] = [0, -1];

/** Uses around the trigger of a 180 000-token window, given that trigger. */
export const TRIGGER_BOUNDARY: readonly { readonly name: string; readonly used: (trigger: number) => number; readonly fires: boolean }[] = [
  { name: "does not fire one token below the trigger", used: (trigger) => trigger - 1, fires: false },
  { name: "fires at the boundary (equality)", used: (trigger) => trigger, fires: true },
  { name: "fires above the trigger", used: () => 179_000, fires: true },
];

/** Uses checked against the warning or the error threshold. */
export const THRESHOLD_CASES: readonly {
  readonly name: string;
  readonly tier: "warning" | "error";
  readonly used: number;
  readonly window: number;
  readonly above: boolean;
}[] = [
  { name: "no warning one token short of the compaction buffer's edge", tier: "warning", used: 180_000 - 36_576 - 1, window: 180_000, above: false },
  { name: "warning when the room left is the compaction buffer", tier: "warning", used: 180_000 - 36_576, window: 180_000, above: true },
  { name: "no error while more than one cut read is left", tier: "error", used: 171_999, window: 180_000, above: false },
  { name: "error when the room left is one cut read", tier: "error", used: 172_000, window: 180_000, above: true },
  { name: "falls back to the default window when none is reported: warning", tier: "warning", used: 100_000, window: 0, above: true },
  { name: "falls back to the default window when none is reported: no error", tier: "error", used: 100_000, window: 0, above: false },
];

export const TIER_CASES: readonly { readonly used: number; readonly tier: string }[] = [
  { used: 100_000, tier: "ok" },
  { used: 160_000, tier: "warning" },
  { used: 175_000, tier: "error" },
];

export const PERCENT_LEFT_CASES: readonly { readonly name: string; readonly used: number; readonly left: number }[] = [
  { name: "rounded at half the window", used: 90_000, left: 50 },
  { name: "clamped at 0 past the window", used: 200_000, left: 0 },
  { name: "100 for nothing used", used: 0, left: 100 },
];

export const TOKEN_COUNTS: readonly { readonly value: unknown; readonly count: number | undefined }[] = [
  { value: "90000", count: 90_000 },
  { value: " 90k ", count: 90_000 },
  { value: "1.5k", count: 1_500 },
  { value: "ninety", count: undefined },
  { value: "0", count: undefined },
  { value: undefined, count: undefined },
];

/** Uses against a trigger set at 90 000 tokens in a 180 000-token window. */
export const SET_TRIGGER_CASES: readonly { readonly used: number; readonly fires: boolean }[] = [
  { used: 90_000, fires: true },
  { used: 89_999, fires: false },
];
