// Session state-bag keys, in ONE place — pure, no IO. Every key of the bag is
// declared here, and session-keys.test.ts pins its string value: the value is
// what a stored session and the runtime (`default_permission_mode`) read, so a
// renamed value silently orphans the state.
//
// Most of these are written by a command and read somewhere else: `/skills` writes
// the registry that the main-loop prompt assembly and the post-compaction restore
// both read; `/hooks` writes what the prompt renders; `/output-style` writes what
// the preferences block renders. Until B-7 every one of them was a string literal
// duplicated at each site (three copies of "skills_attached", two of
// "hooks_registry"), so renaming one would have left the writer and the reader
// pointing at different keys — and the symptom is silence: the command reports
// success, the prompt never changes.

/** `/output-style` — the session's answer style (B-7). */
export const OUTPUT_STYLE_STATE_KEY = "output_style";

/** `/hooks` — the declarative registry; the engine awaits framework G-6. */
export const HOOKS_STATE_KEY = "hooks_registry";

/** `/skills` — attached playbook paths (B-13 consumes them in the prompt). */
export const SKILLS_STATE_KEY = "skills_attached";

// ── B-9 / B-10: the behavior flags, now that something reads them ────────
//
// These five keys existed since E-1 but were written and never read — the
// commands said "consumed by future main-loop wiring". B-9 is that wiring, so
// the keys move here for the same reason the three above did: the writer is a
// command, the reader is the loop, and a literal duplicated across the two is
// how a rename silently stops working.

/** `/effort` — low|medium|high; picks the act() iteration ladder (B-9). */
export const EFFORT_STATE_KEY = "reasoning_effort";

/** `/passes` — 1-5; the number of review rounds /review runs (B-9). */
export const PASSES_STATE_KEY = "reasoning_passes";

/** `/fast` — drops the advisory prompt blocks to buy latency (B-9). */
export const FAST_MODE_STATE_KEY = "fast_mode";

/** `/proactive` — appends the follow-up-suggestion clause to the task (B-9). */
export const PROACTIVE_STATE_KEY = "proactive_suggestions";

/** `/model` — per-turn model override applied to act() (B-10). */
export const MODEL_PREFERENCE_STATE_KEY = "model_preference";

// ── Permissions, configuration, tasks and the compaction breaker ──────────

/** `/mode` — the session-default permission mode (cleared by /clear). A
 *  contract with the host: Orkeon's `SessionStateKeys.DefaultPermissionMode`,
 *  which the REPL console shows and cycles. */
export const DEFAULT_MODE_STATE_KEY = "default_permission_mode";

/** `/permissions` — the rule list: one JSON array of rule lines
 *  (`allow shell_command command=npm test*`; the older `deny:file_write` still reads). */
export const PERMISSION_RULES_STATE_KEY = "permission_rules";

/** `/config` — the session override map, over the settings file (B-6). */
export const CONFIG_MAP_STATE_KEY = "config_map";

/** `/tasks` — the session task list, one JSON array. */
export const TASKS_STATE_KEY = "task_list";

/** The main-loop auto-compaction circuit breaker: consecutive failures (F3 v2). */
export const AUTOCOMPACT_BREAKER_STATE_KEY = "autocompact_consecutive_failures";

/** The dev batch in progress, `{"code": …, "phase": "F<n>"}`: written by the step command
 *  that starts on a batch (/dev-verify), read by the state file written before a compaction. */
export const WORKFLOW_ACTIVE_STATE_KEY = "workflow_active";
