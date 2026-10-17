// Compaction thresholds and budgets — pure constants and the trigger math.
//
// Every number is derived from a fact of this project, stated next to it: the
// runtime's cut of a file_read result, the answer size of the example settings,
// the ceiling of the main loop's header, the skills block's cap. Change the fact
// and the number follows; a number with no such reason does not belong here.
//
// Run tests: node --test src/shared/domain/compaction-thresholds.test.ts

/** chars→tokens heuristic shared with the token_budget tool. */
export const CHARS_PER_TOKEN = 4;

/** The largest single tool result a turn receives: the runtime cuts a file_read
 *  result at 32 000 characters. */
export const FILE_READ_CUT_TOKENS = 32_000 / CHARS_PER_TOKEN;

/** The longest answer a turn may write: `Llm:MaxTokens` of config/appsettings.example.json. */
export const ANSWER_RESERVE_TOKENS = 24_576;

/** The parts of a turn that are not the history: the system header (at most
 *  9 000 characters, MAX_STATIC_HEADER_CHARS) and the user body's fixed blocks,
 *  rounded up. */
export const TURN_FIXED_TOKENS = 4_000;

/**
 * Room a turn needs above the buffer it starts from: its fixed parts, one file
 * read at the runtime's cut and an answer at the example settings' size.
 * Compaction triggers when the buffer leaves less room than that.
 */
export const AUTOCOMPACT_BUFFER_TOKENS = TURN_FIXED_TOKENS + FILE_READ_CUT_TOKENS + ANSWER_RESERVE_TOKENS;

/**
 * The window assumed when token_budget reports none. Erring small is the safe
 * side: an underestimate compacts early, an overestimate overflows. 128 000
 * tokens is a window most current chat models offer.
 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * Failed compactions in a row before the breaker opens. One failure can be a
 * provider hiccup; several in a row mean the summary call itself is broken, and
 * retrying it at the head and the tail of every turn would triple each turn's cost.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * The transcript fed to the summary and to the memory extraction, in characters
 * (12 000 tokens). With the instructions and a summary at its word cap it fits any
 * window this code assumes, and cut in the middle (head and tail kept) it still
 * holds the task and the current work of a long session.
 */
export const TRANSCRIPT_CAP_CHARS = 48_000;

/** Messages session_snip keeps before any summary is paid for: the head anchor
 *  and the last exchanges, the current step's context. */
export const SNIP_RETAIN_COUNT = 5;

/** Facts extracted per compaction: a session yields a handful of durable facts;
 *  more is task state passing for memory. */
export const MAX_EXTRACTED_MEMORIES = 8;

// ── After a compaction: files and skills read back ──────────────────────

/** Files read back after a compaction, the most recently named first: the
 *  current step's file and a few it depends on. Anything older the agent reads
 *  again when it needs it. */
export const POST_COMPACT_MAX_FILES_TO_RESTORE = 5;

/** Largest file read back whole (20 000 characters, inside file_read's cut). A
 *  larger file comes back as its path with a note to read it, never cut: a cut
 *  copy could feed a whole-file write and erase the rest. */
export const POST_COMPACT_PER_FILE_TOKENS = 5_000;

/** Token budget for all restored files together: bounded by construction. */
export const POST_COMPACT_TOKEN_BUDGET = POST_COMPACT_MAX_FILES_TO_RESTORE * POST_COMPACT_PER_FILE_TOKENS;

/** A skill read back after a compaction is capped like the skills block of a turn
 *  (4 000 characters, MAX_SKILL_FRAGMENT_CHARS), so the copy is never longer than
 *  what the turn shows. */
export const POST_COMPACT_PER_SKILL_TOKENS = 1_000;

/**
 * Skills read back after a compaction get their OWN budget, five skills at their
 * cap, separate from the files'. The two restores serve different reasons: files
 * are what the agent was just touching, skills are what the operator decided
 * should always apply. Sharing one budget would let a handful of large files
 * silently evict every playbook — the failure would look like "the agent forgot
 * the rules after a compaction".
 */
export const POST_COMPACT_SKILLS_TOKEN_BUDGET = 5 * POST_COMPACT_PER_SKILL_TOKENS;

// ── Pressure tiers ──────────────────────────────────────────────────────

/** Warning tier: the room left is below what a turn needs. Compaction is due; if
 *  it could not run (the breaker is open), the turn must wind down. */
export const WARNING_THRESHOLD_BUFFER_TOKENS = AUTOCOMPACT_BUFFER_TOKENS;

/** Error tier: one more file read at the runtime's cut could overflow the window. */
export const ERROR_THRESHOLD_BUFFER_TOKENS = FILE_READ_CUT_TOKENS;

/** Normalise a possibly-unreported window to the default (shared by the tiers). */
function effectiveWindow(contextWindow: number): number {
  return contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;
}

/** Token count at which auto-compaction triggers for a given window. */
export function computeTrigger(contextWindow: number): number {
  return effectiveWindow(contextWindow) - AUTOCOMPACT_BUFFER_TOKENS;
}

/** True when the used tokens have reached the trigger (equality counts). */
export function shouldCompact(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= computeTrigger(contextWindow);
}

/** Warning tier reached: used ≥ window − WARNING_THRESHOLD_BUFFER_TOKENS. */
export function isAboveWarningThreshold(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= effectiveWindow(contextWindow) - WARNING_THRESHOLD_BUFFER_TOKENS;
}

/** Error tier reached: used ≥ window − ERROR_THRESHOLD_BUFFER_TOKENS. */
export function isAboveErrorThreshold(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= effectiveWindow(contextWindow) - ERROR_THRESHOLD_BUFFER_TOKENS;
}

/** Percentage of the window still free, clamped to [0, 100]. */
export function percentLeft(usedTokens: number, contextWindow: number): number {
  const window = effectiveWindow(contextWindow);
  return Math.max(0, Math.min(100, Math.round(100 * (window - usedTokens) / window)));
}

/** The graduated pressure tier (`/context`, `/usage`, the turn's gauge): ok | warning | error. */
export function pressureTier(usedTokens: number, contextWindow: number): "ok" | "warning" | "error" {
  if (isAboveErrorThreshold(usedTokens, contextWindow)) return "error";
  if (isAboveWarningThreshold(usedTokens, contextWindow)) return "warning";
  return "ok";
}
