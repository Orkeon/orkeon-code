// The session's permission rules as stored in the state bag, for the permission-rules tests.
import { PERMISSION_RULES_STATE_KEY } from "../domain/session-keys.ts";
import { readRule } from "../domain/agent-policy/permission.ts";
import type { PermissionRule } from "../domain/agent-policy/permission.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";

export const NPM_TEST = { effect: "allow" as const, tool: "shell_command", argument: "command", pattern: "npm test*" };

/** A session whose rules bag holds `stored`, as JSON. */
export function seeded(...stored: unknown[]): FakeSessionStore {
  const session = new FakeSessionStore();
  session.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  return session;
}

/** What the rules bag of `session` holds, parsed. */
export const storedOf = (session: FakeSessionStore): unknown => JSON.parse(session.state.get(PERMISSION_RULES_STATE_KEY) ?? "null");

/** The rule `text` reads as; throws when it reads as none. */
export const R = (text: string): PermissionRule => {
  const rule = readRule(text);
  if (rule === null) throw new Error(`not a rule: ${text}`);
  return rule;
};

/** What a read of a bag holding nothing usable returns. */
export const NO_RULES = { rules: [], dormant: [], invalid: [] };

/** Both stored forms, a rule on an unknown tool and an entry that is no rule. */
export const MIXED_ENTRIES = ["deny:shell_command", "allow:nope", 3, "allow shell_command command=npm test*", "deny file_write"];

/** Entries with a dormant rule and a non-rule, before a rule on the calls of NPM_TEST is added or removed. */
export const BEFORE_ADD = ["deny create_issue", "deny:file_read", "bogus", "deny shell_command command=npm test*"];
export const BEFORE_REMOVE = ["deny create_issue", "deny:file_read", "bogus", "allow shell_command command=npm test*"];

/** A stored bag for a sync: rules in both forms, a non-rule and a dormant rule. */
export const SYNCED_ENTRIES = [
  "deny shell_command command=git push*", "allow:file_write", "bogus", "deny create_issue", "allow shell_command command=npm test*",
];

/** The gate calls that sync makes. */
export const SYNCED_CALLS = [
  "clear",
  "add deny shell_command command=git push*",
  "add allow file_write",
  "add allow shell_command command=npm test*",
];

/** A pattern that starts and ends with a quote. */
export const QUOTED = { effect: "deny" as const, tool: "shell_command", argument: "command", pattern: "\"x\"" };
