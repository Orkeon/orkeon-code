// Auto-compaction thresholds (FINALIZE-PLAN F3.1) — pure constants + trigger
// math, sourced verbatim from the Claude Code v2.1.88 analysis: trigger = effective context window − AUTOCOMPACT_BUFFER_TOKENS,
// circuit breaker at MAX_CONSECUTIVE_FAILURES.
//
// Run tests: node_modules/.bin/tsx --test shared/domain/compaction-thresholds.test.ts

/** Safety buffer subtracted from the context window (source: 13_000). */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

/** Fallback context window when token_budget reports none (source default 180k). */
export const DEFAULT_CONTEXT_WINDOW = 180_000;

/** Consecutive auto-compaction failures before the breaker opens (source: 3). */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** Transcript cap fed to the summary prompt (migrated from session-compact). */
export const TRANSCRIPT_CAP_CHARS = 16_000;

/** Micro-compaction: messages retained by session_snip before any LLM summary. */
export const SNIP_RETAIN_COUNT = 5;

/** Cap on memories extracted before a compaction rewrite. */
export const MAX_EXTRACTED_MEMORIES = 8;

// ── Post-compaction file restoration (E-4, baseline 07 §Preservation rules) ──

/** Max files re-injected after a compaction rewrite (source: 5). */
export const POST_COMPACT_MAX_FILES_TO_RESTORE = 5;

/** Token budget for ALL restored files together (source: 50_000). */
export const POST_COMPACT_TOKEN_BUDGET = 50_000;

/** Per-file token cap inside the restore budget (source: 5 k per file). */
export const POST_COMPACT_PER_FILE_TOKENS = 5_000;

/**
 * B-13: skills re-injected after compaction get their OWN budget, separate from
 * the file-restore budget above.
 *
 * The original re-injects skills after compaction under a separate 25 000-token
 * budget (baseline 07 §1). Separate and not shared, because the two restores
 * compete for different reasons: files are what the agent was just touching, and
 * skills are what the operator decided should always apply. Sharing one budget
 * would let a handful of large files silently evict every playbook — the failure
 * would look like "the agent forgot the rules after a compaction".
 */
export const POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000;

/** Cap per restored skill, so one long playbook cannot consume the whole budget. */
export const POST_COMPACT_PER_SKILL_TOKENS = 5_000;

/** chars→tokens heuristic shared with the token_budget tool. */
export const CHARS_PER_TOKEN = 4;

// ── Graduated pressure tiers (E-5, baseline 07 §Token accounting) ──

/** Warning tier: window − 30 k (source: isAboveWarningThreshold). */
export const WARNING_THRESHOLD_BUFFER_TOKENS = 30_000;

/** Error tier: window − 8 k (source: isAboveErrorThreshold). */
export const ERROR_THRESHOLD_BUFFER_TOKENS = 8_000;

/** Token count at which auto-compaction triggers for a given window. */
export function computeTrigger(contextWindow: number): number {
  const window = contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
  return window - AUTOCOMPACT_BUFFER_TOKENS;
}

/** True when the used tokens have reached the trigger (equality counts). */
export function shouldCompact(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= computeTrigger(contextWindow);
}

/** Normalise a possibly-unreported window to the default (shared by the tiers). */
function effectiveWindow(contextWindow: number): number {
  return contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
}

/** Warning tier reached: used ≥ window − 30 k (E-5). */
export function isAboveWarningThreshold(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= effectiveWindow(contextWindow) - WARNING_THRESHOLD_BUFFER_TOKENS;
}

/** Error tier reached: used ≥ window − 8 k (E-5). */
export function isAboveErrorThreshold(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= effectiveWindow(contextWindow) - ERROR_THRESHOLD_BUFFER_TOKENS;
}

/** Percentage of the window still free, clamped to [0, 100] (E-5). */
export function percentLeft(usedTokens: number, contextWindow: number): number {
  const window = effectiveWindow(contextWindow);
  return Math.max(0, Math.min(100, Math.round(100 * (window - usedTokens) / window)));
}

/** The graduated pressure tier for display (`/context`): ok | warning | error. */
export function pressureTier(usedTokens: number, contextWindow: number): "ok" | "warning" | "error" {
  if (isAboveErrorThreshold(usedTokens, contextWindow)) return "error";
  if (isAboveWarningThreshold(usedTokens, contextWindow)) return "warning";
  return "ok";
}
