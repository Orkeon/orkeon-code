// Session adapter over session_store (buffer, state bag and title), session_snip
// and token_budget.
// The runtime hands back either casing (`messages` or `Messages`, `role` or
// `Role`...); this is the one place that reads them. A failed read is rethrown with
// the tool's own message, the runtime's wrapping gone (withToolMessage).

import type { SessionMsg } from "../../domain/types.ts";
import { messagesOfLastTurns } from "../../domain/snip-turns.ts";
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

/** What a runtime before Orkeon #263 (the rc.6 release) throws for append_message: its session_store answers an
 *  unknown operation `{ success: false }` with no error, which the tool binding reports as
 *  `tools.sessionStore failed: (no error message provided)`. */
const UNKNOWN_OPERATION = "(no error message provided)";

function isUnknownOperation(error: unknown): boolean {
  return (error instanceof Error ? error.message : String(error)).includes(UNKNOWN_OPERATION);
}

/** Whether session_snip counts turns (Orkeon #287). It came in the same merge as edge_list (#281), which the rc.6
 *  release, the tool and docker modes, lacks: there `retain_count` counts the messages kept after the head. A runtime
 *  at the pin with no code-index tools registered reads as a release, and keeps more turns than asked, never fewer. */
function snipCountsTurns(tools: { edgeList?: unknown }): boolean {
  return typeof tools.edgeList === "function";
}

/** A reported count, as a number; absent reads as 0. */
const count = (r: unknown, ...names: string[]): number => Number(pick(r, ...names) ?? 0);

export function createSessionStore(
  tools: Pick<OrkeonTools, "sessionStore" | "sessionSnip" | "tokenBudget"> & { edgeList?: unknown },
): SessionStore {
  // One shape per operation (runtime-tools.ts): a misspelled operation fails here.
  const sessionStore = (input: SessionStoreInput) => tools.sessionStore(input);
  // Set at the first append_message the runtime does not know: the next appends read and rewrite the buffer at once.
  let appendMissing = false;
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
      if (!appendMissing) {
        let resp: unknown;
        try {
          resp = await sessionStore({ operation: "append_message", role, content });
        } catch (e) {
          // A blank role is refused by every runtime, and any failure but an unknown operation's is the store's own:
          // both are rethrown, never hidden behind a rewrite of the buffer.
          if (role.trim() === "" || !isUnknownOperation(e)) throw e;
          appendMissing = true;
        }
        if (!appendMissing) {
          // A refused append (a blank role) says so, as a failed write would.
          if (pick(resp, "success", "Success") === false) throw new Error(`session_store refused to append a '${role}' message`);
          return;
        }
      }
      // A runtime before Orkeon #263 (the rc.6 release, the tool and docker modes) has no append_message: the message is
      // added by reading and rewriting the buffer, as before #263, and this store does not ask for append_message again.
      if (role.trim() === "") throw new Error(`session_store refused to append a '${role}' message`);
      const stored = asArray(pick(await sessionStore({ operation: "read_messages" }), "messages", "Messages"));
      await sessionStore({ operation: "write_messages", messages: [...stored, { role, content }] });
    },
    async reset() {
      return count(await sessionStore({ operation: "reset" }), "removed_count", "removedCount", "RemovedCount");
    },
    async snip(turns) {
      // retain_count counts turns since Orkeon #287; kept_from (where the kept tail began) is not read: nothing uses it.
      // Before #287 it counts messages: the tail those turns hold is measured on the buffer, so the same tail is kept.
      let retain = turns;
      if (!snipCountsTurns(tools)) {
        const stored = asArray(pick(await withToolMessage(() => sessionStore({ operation: "read_messages" })), "messages", "Messages"));
        const tail = messagesOfLastTurns(normalizeMessages(stored), turns);
        if (tail === null) return { removed: 0, retained: stored.length };
        retain = tail;
      }
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
