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

/** The tokens of the context window by kind of entry (Orkeon #226). */
export interface TokenKinds {
  system: number;
  user: number;
  assistant: number;
  tool: number;
  other: number;
}

/** Tokens used in the context window, and the window's size; by kind when the host reports it. */
export interface TokenBudget {
  used: number;
  window: number;
  byKind?: TokenKinds;
}

/** What a snip of the conversation buffer removed and kept, in entries. */
export interface SnipResult {
  removed: number;
  retained: number;
}

/** The session saved now, and a saved one loaded in place (Orkeon #227): served while the host persists the
 *  session per project (`Orkeon:Cli:Session:Persist`), at virtual paths the file system mounts. */
export interface SessionSwitch {
  /** Write the session now: to its own file, resolving to that virtual path, or to `path` in the same shape. */
  save(path?: string): Promise<string>;
  /** Swap the buffer, the state bag, the id and the title for those of the file at `path`; resolves to the number
   *  of messages loaded. A missing, unreadable or ill-shaped file rejects and the session stays as it was. */
  load(path: string): Promise<number>;
}

/** The session: its conversation buffer, its state bag (string values that survive
 *  crew runs and are cleared by /clear), the context window's budget and
 *  the session's title. */
export interface SessionStore {
  readMessages(): Promise<SessionMessages>;
  /** Replace the conversation buffer. */
  writeMessages(messages: readonly StoredMessage[]): Promise<void>;
  /** Add one entry at the end of the buffer, which is neither read nor rewritten (Orkeon #263). */
  appendMessage(role: string, content: string): Promise<void>;
  /** Empty the conversation buffer; resolves to how many entries it removed. */
  reset(): Promise<number>;
  /** Cut the buffer down to its head and its last `retain` exchanges. */
  snip(retain: number): Promise<SnipResult>;
  setTitle(title: string): Promise<void>;
  /** A state value; null when unset. */
  readState(key: string): Promise<string | null>;
  /** Several state values in one read (Orkeon #263): every key asked, null when unset. */
  readStates(keys: readonly string[]): Promise<Record<string, string | null>>;
  /** Set a state value; null removes the key. */
  writeState(key: string, value: string | null): Promise<void>;
  readBudget(): Promise<TokenBudget>;
}
