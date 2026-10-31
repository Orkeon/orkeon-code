// FakeSessionStore: the SessionStore port over a Map (the state bag) and a message
// array (the buffer). `budget` is what readBudget answers, `snipped` what snip
// answers (each snip lands in `snips`, and `budgetAfterSnip`, when set, becomes
// the budget); reset empties the buffer and setTitle sets `title`. A `failure`
// makes every call throw it, as a host without the session tools does; a
// `readStateFailure` makes readState alone throw it (a state bag that cannot be
// read, but can be written), a `writeStateFailure` writeState alone (one that
// cannot be written). The batch read (readStates) fails with readState, or alone
// with `readStatesFailure` (a host without the batch). The
// counters say what a caller asked: `readStateCalls` the key of each single read,
// `readStatesCalls` the keys of each batch read, `readMessagesCalls` and
// `writeMessagesCalls` the reads and rewrites of the buffer, `appendCalls` the
// entries appended one at a time.
import type {
  SessionMessages, SessionStore, SnipResult, StoredMessage, TokenBudget,
} from "../../../src/shared/application/ports.ts";
import type { SessionMsg } from "../../../src/shared/domain/types.ts";

export class FakeSessionStore implements SessionStore {
  state = new Map<string, string>();
  messages: SessionMsg[] = [];
  budget: TokenBudget = { used: 0, window: 0 };
  snipped: SnipResult = { removed: 0, retained: 0 };
  budgetAfterSnip: TokenBudget | null = null;
  snips: number[] = [];
  title: string | null = null;
  failure: Error | null = null;
  readStateFailure: Error | null = null;
  writeStateFailure: Error | null = null;
  readStatesFailure: Error | null = null;
  readStateCalls: string[] = [];
  readStatesCalls: string[][] = [];
  readMessagesCalls = 0;
  writeMessagesCalls = 0;
  appendCalls: SessionMsg[] = [];

  check(): void {
    if (this.failure) throw this.failure;
  }

  async readMessages(): Promise<SessionMessages> {
    this.readMessagesCalls++;
    this.check();
    return { stored: [...this.messages], messages: this.messages.map((m) => ({ role: m.role, content: m.content })) };
  }

  async writeMessages(messages: readonly StoredMessage[]): Promise<void> {
    this.writeMessagesCalls++;
    this.check();
    this.messages = [...messages] as SessionMsg[];
  }

  async appendMessage(role: string, content: string): Promise<void> {
    this.appendCalls.push({ role, content });
    this.check();
    this.messages = [...this.messages, { role, content }];
  }

  async reset(): Promise<number> {
    this.check();
    const removed = this.messages.length;
    this.messages = [];
    return removed;
  }

  async snip(retain: number): Promise<SnipResult> {
    this.check();
    this.snips.push(retain);
    if (this.budgetAfterSnip) this.budget = this.budgetAfterSnip;
    return this.snipped;
  }

  async setTitle(title: string): Promise<void> {
    this.check();
    this.title = title;
  }

  async readState(key: string): Promise<string | null> {
    this.readStateCalls.push(key);
    this.check();
    if (this.readStateFailure) throw this.readStateFailure;
    return this.state.get(key) ?? null;
  }

  async readStates(keys: readonly string[]): Promise<Record<string, string | null>> {
    this.readStatesCalls.push([...keys]);
    this.check();
    if (this.readStateFailure) throw this.readStateFailure;
    if (this.readStatesFailure) throw this.readStatesFailure;
    return Object.fromEntries(keys.map((k) => [k, this.state.get(k) ?? null]));
  }

  async writeState(key: string, value: string | null): Promise<void> {
    this.check();
    if (this.writeStateFailure) throw this.writeStateFailure;
    if (value === null) this.state.delete(key);
    else this.state.set(key, value);
  }

  async readBudget(): Promise<TokenBudget> {
    this.check();
    return this.budget;
  }
}
