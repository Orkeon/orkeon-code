// Session adapter over session_store (buffer, state bag and title), session_snip
// and token_budget.
// The runtime hands back either casing (`messages` or `Messages`, `role` or
// `Role`...); this is the one place that reads them. A failed read is rethrown with
// the tool's own message, the runtime's wrapping gone (withToolMessage).

import type { SessionMsg } from "../../domain/types.ts";
import type { SessionStore, StoredMessage, TokenBudget, TokenKinds } from "../../application/ports.ts";
import type { SessionStoreInput } from "./runtime-tools.ts";
import { asArray, pick, withToolMessage } from "./tool-results.ts";

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
      const resp = await withToolMessage(() => sessionStore({ operation: "read_messages" }));
      // A buffer that is not a list holds no message: the compaction skips it and
      // the commands show an empty session, rather than failing on it.
      const stored: StoredMessage[] = asArray(pick(resp, "messages", "Messages"));
      return { stored, messages: normalizeMessages(stored) };
    },
    async writeMessages(messages) {
      await sessionStore({ operation: "write_messages", messages });
    },
    async appendMessage(role, content) {
      const resp = await sessionStore({ operation: "append_message", role, content });
      // A refused append (a blank role) says so, as a failed write would.
      if (pick(resp, "success", "Success") === false) throw new Error(`session_store refused to append a '${role}' message`);
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
      const resp = await withToolMessage(() => sessionStore({ operation: "get_state", key }));
      const v = pick(resp, "value", "Value");
      return v == null ? null : String(v);
    },
    async readStates(keys) {
      if (keys.length === 0) return {};
      const resp = await withToolMessage(() => sessionStore({ operation: "get_state", keys }));
      // A key never set is absent from `values` (the tool pipeline drops nulls): null here.
      const values = pick(resp, "values", "Values");
      const out: Record<string, string | null> = {};
      for (const key of keys) {
        const v = values !== null && typeof values === "object" ? (values as Record<string, unknown>)[key] : undefined;
        out[key] = v == null ? null : String(v);
      }
      return out;
    },
    async writeState(key, value) {
      await sessionStore({ operation: "set_state", key, value });
    },
    async readBudget() {
      const b = await tools.tokenBudget();
      const budget: TokenBudget = {
        used: count(b, "used_tokens", "usedTokens"),
        window: count(b, "context_window_tokens", "contextWindowTokens"),
      };
      // By kind since Orkeon #226; an older host reports none.
      const kinds = pick(b, "used_tokens_by_kind", "usedTokensByKind");
      if (kinds !== undefined && kinds !== null && typeof kinds === "object") {
        const kind = (name: keyof TokenKinds) => count(kinds, name, name[0].toUpperCase() + name.slice(1));
        budget.byKind = { system: kind("system"), user: kind("user"), assistant: kind("assistant"), tool: kind("tool"), other: kind("other") };
      }
      return budget;
    },
  };
}
