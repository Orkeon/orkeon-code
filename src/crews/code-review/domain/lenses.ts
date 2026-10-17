// B-9 — which review lenses run, and how many rounds of them. Pure, no IO.
//
// Two settings meet here, and both were declared before anything read them:
//   `review.lenses` (B-6 key space, "consumed by crews/code-review") selected
//   nothing, and `/passes` (E-1) was written and never read.
//
// Moved out of ../application/prompts.ts — that module is pure too, but the
// selection is a decision, not a prompt, and it needs its own test file. The
// prompts module re-exports LENSES so existing importers keep working, the same
// way scope.ts kept resolveCommitRange re-exported when it moved.

export interface ReviewLens {
  key: string;
  instruction: string;
}

/** The three review lenses, each blind to the others (run via Promise.all). */
export const LENSES: readonly ReviewLens[] = [
  { key: "correctness", instruction: "logic errors, edge cases, broken contracts, missing error handling" },
  { key: "security", instruction: "injection, secrets, unsafe IO, auth/authz gaps, unvalidated input" },
  { key: "style", instruction: "readability, naming, dead code, convention violations" },
];

export function lensKeys(): string[] {
  return LENSES.map((l) => l.key);
}

export interface LensSelection {
  lenses: readonly ReviewLens[];
  /** Names in the setting that match no lens — reported, never silently ignored. */
  unknown: string[];
}

/**
 * Resolves the `review.lenses` setting: a comma-separated list of lens keys.
 *
 * Unset, blank, or all-unknown ⇒ all three lenses. A review that silently
 * narrowed itself to nothing (or to two lenses because one was misspelt) is the
 * worst outcome available here: the report would look complete and be blind.
 * So an unrecognised name is returned for the caller to warn about, and a
 * selection that matched nothing falls back to the full set rather than
 * producing an empty review.
 *
 * Order follows LENSES, not the setting: the report is easier to compare across
 * runs when the lenses always appear in the same order.
 */
export function selectLenses(setting: unknown): LensSelection {
  const requested = String(setting ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  if (requested.length === 0) return { lenses: LENSES, unknown: [] };

  const known = new Set(lensKeys());
  const unknown = [...new Set(requested.filter((r) => !known.has(r)))];
  const wanted = new Set(requested.filter((r) => known.has(r)));

  if (wanted.size === 0) return { lenses: LENSES, unknown };
  return { lenses: LENSES.filter((l) => wanted.has(l.key)), unknown };
}

/** Where an effective lens selection came from. */
export type LensSource = "input" | "config" | "default";

export interface ResolvedLensSelection extends LensSelection {
  source: LensSource;
}

/**
 * The effective lens selection: crew INPUT beats the `review.lenses` setting.
 *
 * B-12 needs this: `/bughunter` and `/security-review` are the same crew narrowed
 * to one lens, and they say so per invocation. A setting is a standing preference,
 * an input is a deliberate act on this run — so the input wins, the same way an
 * explicit `plan:` prefix beats the session's default permission mode.
 *
 * An input naming only unknown lenses falls through to the setting rather than to
 * the full set, because the caller clearly meant to narrow and the honest answer to
 * "narrow to something I do not have" is the next-widest thing they configured.
 */
export function resolveLensSelection(sources: {
  input?: unknown;
  config?: unknown;
}): ResolvedLensSelection {
  const fromInput = selectLenses(normalizeLensInput(sources?.input));
  if (namesAKnownLens(sources?.input)) return { ...fromInput, source: "input" };

  const fromConfig = selectLenses(sources?.config);
  const unknown = [...new Set([...fromInput.unknown, ...fromConfig.unknown])];
  if (namesAKnownLens(sources?.config)) return { ...fromConfig, unknown, source: "config" };

  return { lenses: LENSES, unknown, source: "default" };
}

/** Accepts `"a,b"` and `["a","b"]` — a command may pass either. */
function normalizeLensInput(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map((r) => String(r ?? "")).join(",");
  return String(raw ?? "");
}

/**
 * True when the source names at least one KNOWN lens.
 *
 * Deliberately not "the selection is narrower than the full set": naming all three
 * explicitly is still an explicit choice, and it must win over a setting that says
 * something else. Deliberately not "the source is non-empty" either, or a typo
 * would win and silently review everything.
 */
function namesAKnownLens(raw: unknown): boolean {
  const known = lensKeys().map((k) => k.toLowerCase());
  return normalizeLensInput(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((s) => s.length > 0 && known.includes(s));
}

/** One line for the report header: what ran, how many times, and on whose say-so. */
export function describeReviewPlan(
  lenses: readonly ReviewLens[],
  passes: number,
  source: LensSource = "default",
): string {
  const plural = passes === 1 ? "pass" : "passes";
  const via = source === "default" ? "" : ` (lenses from the ${source})`;
  return `${passes} ${plural} × ${lenses.length} lens(es): ${lenses.map((l) => l.key).join(", ")}${via}`;
}
