// The session port: the conversation buffer, the state bag and the context window's budget.
// Types only, re-exported by ../ports.ts.

import type { SessionMsg } from "../../domain/types.ts";

/** A conversation-buffer entry as the session holds it. Its field casing is the
 *  runtime's, so it is read through `SessionMessages.messages`; written back as
 *  read, it stays untouched. */
export type StoredMessage = unknown;

/** The conversation buffer, read once. */
export interface SessionMessages {
  /** Each entry as stored, in order. */
  stored: StoredMessage[];
  /** The same entries, as role and content. */
  messages: SessionMsg[];
}

/** Tokens used in the context window, and the window's size. */
export interface TokenBudget {
  used: number;
  window: number;
}

/** What a snip of the conversation buffer removed and kept, in entries. */
export interface SnipResult {
  removed: number;
  retained: number;
}

/** The session: its conversation buffer, its state bag (string values that survive
 *  crew runs and are cleared by /clear), the context window's budget and
 *  the session's title. */
export interface SessionStore {
  readMessages(): Promise<SessionMessages>;
  /** Replace the conversation buffer. */
  writeMessages(messages: readonly StoredMessage[]): Promise<void>;
  /** Empty the conversation buffer; resolves to how many entries it removed. */
  reset(): Promise<number>;
  /** Cut the buffer down to its head and its last `retain` exchanges. */
  snip(retain: number): Promise<SnipResult>;
  setTitle(title: string): Promise<void>;
  /** A state value; null when unset. */
  readState(key: string): Promise<string | null>;
  /** Set a state value; null removes the key. */
  writeState(key: string, value: string | null): Promise<void>;
  readBudget(): Promise<TokenBudget>;
}
