// Session adapter over session_store (buffer, state bag and title), session_snip
// and token_budget.
// The runtime hands back either casing (`messages` or `Messages`, `role` or
// `Role`...); this is the one place that reads them.

import type { SessionMsg } from "../../domain/types.ts";
import type { SessionStore, StoredMessage } from "../../application/ports.ts";
import type { SessionStoreInput } from "./runtime-tools.ts";
import { asArray, pick } from "./tool-results.ts";

/** The `{ role, content }` view of stored entries, for transcripts and history. */
function normalizeMessages(stored: StoredMessage[]): SessionMsg[] {
  return stored.map((m) => ({
    role: String(pick(m, "role", "Role") ?? ""),
    content: String(pick(m, "content", "Content") ?? ""),
  }));
}

/** A reported count, as a number; absent reads as 0. */
const count = (r: unknown, ...names: string[]): number => Number(pick(r, ...names) ?? 0);

export function createSessionStore(
  tools: Pick<OrkeonTools, "sessionStore" | "sessionSnip" | "tokenBudget">,
): SessionStore {
  // One shape per operation (runtime-tools.ts): a misspelled operation fails here.
  const sessionStore = (input: SessionStoreInput) => tools.sessionStore(input);
  return {
    async readMessages() {
      const resp = await sessionStore({ operation: "read_messages" });
      // A buffer that is not a list holds no message: the compaction skips it and
      // the commands show an empty session, rather than failing on it.
      const stored: StoredMessage[] = asArray(pick(resp, "messages", "Messages"));
      return { stored, messages: normalizeMessages(stored) };
    },
    async writeMessages(messages) {
      await sessionStore({ operation: "write_messages", messages });
    },
    async reset() {
      return count(await sessionStore({ operation: "reset" }), "removed_count", "removedCount", "RemovedCount");
    },
    async snip(retain) {
      const resp = await tools.sessionSnip({ retain_count: retain });
      return {
        removed: count(resp, "removed_count", "removedCount", "RemovedCount"),
        retained: count(resp, "retained_count", "retainedCount", "RetainedCount"),
      };
    },
    async setTitle(title) {
      await sessionStore({ operation: "set_title", title });
    },
    async readState(key) {
      const resp = await sessionStore({ operation: "get_state", key });
      const v = pick(resp, "value", "Value");
      return v == null ? null : String(v);
    },
    async writeState(key, value) {
      await sessionStore({ operation: "set_state", key, value });
    },
    async readBudget() {
      const b = await tools.tokenBudget();
      return {
        used: count(b, "used_tokens", "usedTokens"),
        window: count(b, "context_window_tokens", "contextWindowTokens"),
      };
    },
  };
}
