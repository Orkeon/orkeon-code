// The session's permission rules: kept in the session state bag, where
// /permissions writes them, and enforced by the host's permission gate, which
// holds its own copy. The gate keeps its rules until the REPL exits and removes
// them only all at once, so a sync clears it and replays the stored list: the
// gate then holds exactly what the bag holds, whatever an earlier command, an
// earlier session or /reset-session left in either. /permissions syncs after
// every change, and every command that launches the main loop syncs first.
//
// Every stored entry is kept as written until the user removes it: a rule on a
// tool the session does not know now (an extra tool `tools.extra` no longer lists,
// or a setting that could not be read) is DORMANT — kept, left out of the gate,
// reported — and applies again once the tool is listed; an entry that is not a
// rule at all is kept and ignored. A change rewrites only the rule it is about.

import type { PermissionRules, SessionStore } from "./ports.ts";
import { readJsonArray, writeJson } from "./session-state.ts";
import { formatRule, parseStoredRule, readRule, sameCalls } from "../domain/agent-policy/permission.ts";
import type { PermissionRule } from "../domain/agent-policy/permission.ts";
import { PERMISSION_RULES_STATE_KEY } from "../domain/session-keys.ts";

/** The stored rules, sorted by what the session can do with them. */
export interface StoredRules {
  /** The rules on a built-in or configured extra tool, in stored order: what the gate is handed. */
  rules: PermissionRule[];
  /** The rules on a tool neither built in nor listed in `tools.extra`, as written: kept, not enforced. */
  dormant: string[];
  /** The entries that are not rules, as written: kept, ignored. */
  invalid: string[];
}

/** Reads the stored rules; a rule names a built-in tool or one of `extraNames`, the configured extra tools. */
export async function readPermissionRules(
  session: Pick<SessionStore, "readState">,
  extraNames: readonly string[] = [],
): Promise<StoredRules> {
  const stored: StoredRules = { rules: [], dormant: [], invalid: [] };
  for (const entry of await readJsonArray(session, PERMISSION_RULES_STATE_KEY)) {
    const rule = parseStoredRule(entry, extraNames);
    if (rule) stored.rules.push(rule);
    else if (readRule(entry)) stored.dormant.push(String(entry));
    else stored.invalid.push(String(entry));
  }
  return stored;
}

/** Rewrites the stored entries, keeping as written every entry `keep` accepts (it
 *  reads the rule an entry holds, null for one that is not a rule), then appending
 *  `added`; returns the entries left out. */
async function rewrite(
  session: Pick<SessionStore, "readState" | "writeState">,
  keep: (rule: PermissionRule | null) => boolean,
  added: string[] = [],
): Promise<unknown[]> {
  const entries = await readJsonArray(session, PERMISSION_RULES_STATE_KEY);
  const kept = entries.map((entry) => keep(readRule(entry)));
  await writeJson(session, PERMISSION_RULES_STATE_KEY, [...entries.filter((_, i) => kept[i]), ...added]);
  return entries.filter((_, i) => !kept[i]);
}

/** Stores `rule`, in place of any stored rule on the same calls whatever its effect:
 *  the list never holds an allow and a deny for the same calls. */
export async function addPermissionRule(
  session: Pick<SessionStore, "readState" | "writeState">,
  rule: PermissionRule,
): Promise<void> {
  await rewrite(session, (stored) => stored === null || !sameCalls(stored, rule), [formatRule(rule)]);
}

/** Removes the stored rules equal to `rule` (effect, tool, argument and pattern),
 *  dormant ones included; returns them, empty when there was none. */
export async function removePermissionRule(
  session: Pick<SessionStore, "readState" | "writeState">,
  rule: PermissionRule,
): Promise<PermissionRule[]> {
  const removed = await rewrite(
    session,
    (stored) => stored === null || stored.effect !== rule.effect || !sameCalls(stored, rule),
  );
  return removed.map(readRule).filter((r): r is PermissionRule => r !== null);
}

/** Removes every stored entry. */
export async function clearPermissionRules(session: Pick<SessionStore, "writeState">): Promise<void> {
  await writeJson(session, PERMISSION_RULES_STATE_KEY, []);
}

/** What a sync left in force, and what it left out. */
export interface RuleSync extends StoredRules {
  /** False when the host keeps no session rules: the gate decides from the mode alone. */
  applied: boolean;
}

/** Makes the gate hold the stored rules: clear it, then add each rule in stored order. */
export async function syncPermissionRules(deps: {
  session: Pick<SessionStore, "readState">;
  gate: PermissionRules;
  /** The configured extra tools, which rules may name. */
  extraNames?: readonly string[];
}): Promise<RuleSync> {
  const stored = await readPermissionRules(deps.session, deps.extraNames);
  if (!deps.gate.available()) return { ...stored, applied: false };
  deps.gate.clear();
  for (const rule of stored.rules) deps.gate.add(rule);
  return { ...stored, applied: true };
}
