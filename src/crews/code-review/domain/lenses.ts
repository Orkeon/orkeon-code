// Which review lenses run, and how many rounds of them. Pure, no IO.
//
// Two settings meet here: `review.lenses` (the /config key space) selects the
// lenses, `/passes` the rounds. Each lens says what it looks for and what it
// leaves to the others, so three blind reviewers do not report the same thing
// three times, nor what no lens should report at all.

export interface ReviewLens {
  key: string;
  /** The defects this lens hunts, as concrete patterns. */
  looksFor: string;
  /** What it does not report: another lens's ground, or what no lens should report. */
  leaves: string;
}

/** The three review lenses, each blind to the others (run via Promise.all). */
export const LENSES: readonly ReviewLens[] = [
  {
    key: "correctness",
    looksFor:
      "behaviour the change gets wrong: an inverted or incomplete condition, an off-by-one, a value used " +
      "before it is set, a case the new code does not handle although its inputs allow it, a caller or a " +
      "contract the change breaks, a resource left open, steps that race",
    leaves:
      "style and naming, defensive checks for inputs the code cannot receive, security (another lens), " +
      "performance unless the change makes something fail",
  },
  {
    key: "security",
    looksFor:
      "a way in that the change opens: input reaching a shell, a query, a path or markup unescaped, a " +
      "secret written into code, logs or output, an authorisation check missing or weakened, unsafe " +
      "deserialisation, a file or network access wider than needed",
    leaves:
      "attacks with no input that reaches the code, hardening wishes, issues the change neither adds nor " +
      "touches, style and plain bugs (other lenses)",
  },
  {
    key: "style",
    looksFor:
      "what makes the change harder to read or maintain: a misleading name, dead or duplicated code the " +
      "change adds, a comment that restates the code or narrates the change, a break with the conventions " +
      "the project states or the surrounding code follows",
    leaves: "what a formatter fixes, taste with no concrete cost, correctness and security (other lenses)",
  },
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
