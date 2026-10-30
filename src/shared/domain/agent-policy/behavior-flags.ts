// What the persisted behavior flags actually DO. Pure, no IO.
//
// `/effort`, `/fast`, `/passes` and `/proactive` are persisted settings; this
// module is the semantics half — the loop and the review crew are the consumption
// half.
//
// The governing constraint: an UNCONFIGURED session must behave exactly as it did
// before the flags existed. Every default below is therefore the value that was hard-coded at
// the call site (40 act iterations, one review pass, nothing dropped, no extra
// clause), so turning a flag on is the only thing that changes anything.

// ── /effort → the act() iteration ladder ─────────────────────────────────

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

/** Unset ⇒ `medium`, whose ladder rung IS the pre-B-9 hard-coded value. */
export const DEFAULT_EFFORT: EffortLevel = "medium";

/**
 * Iterations granted to `ctx.llm.act` per level.
 *
 * The ladder bounds the tool-calling loop. Since Orkeon 1.0.0-rc.6 the level also reaches the
 * provider: `act({ effort })` and `AgentBuilder.effort()` turn its thinking on at that level (A-3).
 * Only a level `/effort` stored is forwarded (`providerEffort`): an unconfigured session sends none,
 * so it keeps the provider's own default and the 40 iterations it always had.
 *
 * `xhigh` and `max` are Anthropic's two levels above `high`; to a provider whose field does not know one the
 * runtime sends the highest level it knows below it, with a warning in its log. The ladder keeps climbing: a
 * turn that asks the model for its most thorough reasoning is also the one given the most room to act.
 */
export const EFFORT_MAX_ITERATIONS: Readonly<Record<EffortLevel, number>> = {
  low: 10,
  medium: 40,
  high: 80,
  xhigh: 120,
  max: 160,
};

export function isEffortLevel(raw: unknown): raw is EffortLevel {
  return EFFORT_LEVELS.includes(String(raw ?? "").trim().toLowerCase() as EffortLevel);
}

/** Normalise a stored value; anything unrecognised falls back to the default. */
export function resolveEffort(raw: unknown): EffortLevel {
  const v = String(raw ?? "").trim().toLowerCase();
  return isEffortLevel(v) ? (v as EffortLevel) : DEFAULT_EFFORT;
}

/** The level forwarded to the provider (`act({effort})`): a stored valid level; undefined when none is stored. */
export function providerEffort(raw: unknown): EffortLevel | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  return isEffortLevel(v) ? (v as EffortLevel) : undefined;
}

/** The act() iteration cap for a stored effort value. */
export function maxIterationsFor(raw: unknown): number {
  return EFFORT_MAX_ITERATIONS[resolveEffort(raw)];
}

// ── /passes → review rounds ──────────────────────────────────────────────

export const MIN_PASSES = 1;
export const MAX_PASSES = 5;
/** Unset ⇒ 1 — the single fan-out /review has always done. */
export const DEFAULT_PASSES = MIN_PASSES;

/** Clamp a stored pass count into 1..5; junk ⇒ the default. */
export function resolvePasses(raw: unknown): number {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isInteger(n)) return DEFAULT_PASSES;
  return Math.min(MAX_PASSES, Math.max(MIN_PASSES, n));
}

// ── /fast → drop the advisory prompt blocks ──────────────────────────────

/**
 * The blocks `/fast` omits from the assembled prompt.
 *
 * Chosen as the two ADVISORY blocks — the ones that widen the model's context
 * without being required to answer the request — and they are also the two
 * largest: an attached skill is capped at 4 000 characters EACH (B-13) and the
 * memory block carries up to four categories of recalled notes.
 *
 * Everything else stays: the static header (identity, tool list, CLAUDE.md) is
 * the cache prefix and dropping it would cost more than it saves; preferences
 * and hooks are operator instructions; git context, history and the gauge are
 * the situation. Dropping those would change WHAT is answered, not how fast.
 *
 * Fast mode is a real degradation, so the loop logs it — a shorter answer with
 * no memory must never look like the model simply forgot.
 */
export const FAST_MODE_DROPPED_BLOCKS = ["skills", "memory"] as const;
export type DroppableBlock = (typeof FAST_MODE_DROPPED_BLOCKS)[number];

export function fastModeDrops(fast: boolean): readonly DroppableBlock[] {
  return fast ? FAST_MODE_DROPPED_BLOCKS : [];
}

// ── /proactive → the follow-up clause ────────────────────────────────────

/**
 * Appended to the task block (last, with the request) rather than added as its
 * own context block: it is an instruction about the ANSWER's shape, and the
 * furthest thing from the task is the easiest for a model to lose.
 */
export const PROACTIVE_CLAUSE =
  "(Proactive mode: after the answer, suggest at most three concrete next steps under " +
  "'Next steps'; leave the list out when the work is self-contained.)";

export function proactiveSuffix(on: boolean): string {
  return on ? `\n\n${PROACTIVE_CLAUSE}` : "";
}

// ── the flag set the loop reads in one go ────────────────────────────────

export interface BehaviorFlags {
  effort: EffortLevel;
  /** The level the provider thinks at: the one /effort stored, null when it stored none (A-3). */
  thinking: EffortLevel | null;
  passes: number;
  fast: boolean;
  proactive: boolean;
  /** `/model` override for this turn; empty ⇒ the boot model (B-10). */
  model: string;
}

/** The unconfigured session — the pre-B-9 behaviour, byte for byte. */
export const DEFAULT_BEHAVIOR_FLAGS: BehaviorFlags = {
  effort: DEFAULT_EFFORT,
  thinking: null,
  passes: DEFAULT_PASSES,
  fast: false,
  proactive: false,
  model: "",
};

/** Build the flag set from raw stored strings (all optional). */
export function resolveBehaviorFlags(raw: {
  effort?: unknown; passes?: unknown; fast?: unknown; proactive?: unknown; model?: unknown;
}): BehaviorFlags {
  return {
    effort: resolveEffort(raw?.effort),
    thinking: providerEffort(raw?.effort) ?? null,
    passes: resolvePasses(raw?.passes),
    fast: String(raw?.fast ?? "") === "true",
    proactive: String(raw?.proactive ?? "") === "true",
    model: String(raw?.model ?? "").trim(),
  };
}

/**
 * One line naming every flag that is NOT at its default, or "" when the session
 * is unconfigured. The loop logs it: a turn that behaves differently must say
 * which setting made it so, otherwise the effect reads as model variance.
 */
export function describeActiveFlags(flags: BehaviorFlags): string {
  const active: string[] = [];
  // A stored level, even `medium`, is named: it turns the provider's thinking on.
  if (flags.thinking !== null) {
    active.push(`effort=${flags.effort} (act maxIterations=${EFFORT_MAX_ITERATIONS[flags.effort]}, provider thinking ${flags.thinking})`);
  }
  if (flags.passes !== DEFAULT_PASSES) active.push(`passes=${flags.passes}`);
  if (flags.fast) active.push(`fast=on (dropping ${FAST_MODE_DROPPED_BLOCKS.join(", ")})`);
  if (flags.proactive) active.push("proactive=on");
  if (flags.model) active.push(`model=${flags.model}`);
  return active.join(" · ");
}
