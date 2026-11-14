// The text the operator reads from a main-loop turn: the answer's notes, the log lines, the crew's own failures.

// ── The turn's answer ────────────────────────────────────────────────────

export const NO_PROMPT = "No prompt provided.";

/** The answer when the prelude left nothing to send. */
export function nothingToSend(what: string): string {
  return `Nothing to send: ${what} came back empty.`;
}

/** The line the operator reads once per session when the host's permission gate is off. */
export function gateOffWarning(mode: string): string {
  return "⚠ the host's permission gate is off (Orkeon:Security:PermissionGate:Enabled is not true): " +
    `mode '${mode}' and the session's rules check nothing, every tool call runs. /permissions shows it.`;
}

/** The line shown under an answer the token budget cut short (Orkeon #218, the context counted once since #224):
 *  the model's last call, made without tools once the crew's budget was spent. */
export const BUDGET_EXHAUSTED_LINE =
  "⚠ the turn stopped on its token budget: the answer above is the model's wrap-up, made without tools, and may be cut short";

// ── Log lines ────────────────────────────────────────────────────────────

export const MODE_ORIGIN_BUILT_IN = "no mode given at launch, built-in 'default'";

/** The log line of a prelude about to run. */
export function preludeRunning(label: string, tool: string): string {
  return `${label}: ${tool}, before the turn`;
}

/** The warning when the token budget ran out. */
export function budgetRanOut(error: string): string {
  return `the token budget ran out: the model's wrap-up is the answer (${error})`;
}

/** The log line of a stop check that sends the answer back. */
export function stopCheckSendsBack(guard: string, reason: string): string {
  return `stop check '${guard}': the answer goes back once (${reason})`;
}

/** The warning when the stop check's retry failed. */
export function stopCheckRetryFailed(guard: string, error: string): string {
  return `stop check '${guard}': the retry failed (${error}); the first answer stands`;
}

/** The log line of the effort an act was given, and what the provider receives when it is not that level. */
export function actEffort(level: string, maxIterations: number, sent: string): string {
  return `act — effort: ${level}${sent}, maxIterations: ${maxIterations}`;
}
/** The same line when the session stored no level and the host's own configuration asks for one. */
export function actHostEffort(level: string, maxIterations: number, sent: string): string {
  return `act — effort: none stored, the host asks for ${level}${sent}, maxIterations: ${maxIterations}`;
}
export const effortSentAs = (sent: string, model: string): string => ` (sent as '${sent}' to ${model})`;
export const effortNotSent = (model: string): string => ` (none sent to ${model})`;

/** The warning when a /model override is dropped under an `llm.profile`. */
export function modelOverrideIgnored(model: string, profile: string): string {
  return `/model override '${model}' ignored: llm.profile ${profile} is active`;
}

/** The warning naming the tools the permission rules removed. */
export function rulesRemoved(tools: string): string {
  return `permission rules removed: ${tools}`;
}

/** The warning of a permission rule that changes nothing. */
export function ruleWithoutEffect(reason: string): string {
  return `permission rule without effect: ${reason}`;
}

/** The warning when the auto-compact breaker is open. */
export function autoCompactSuppressed(failures: number): string {
  return `auto-compact suppressed (breaker open after ${failures} consecutive failures)`;
}
