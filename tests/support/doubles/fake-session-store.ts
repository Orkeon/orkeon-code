// FakeSessionStore: the SessionStore port over a Map (the state bag) and a message
// array (the buffer). `budget` is what readBudget answers, `snipped` what snip
// answers (each snip lands in `snips`, and `budgetAfterSnip`, when set, becomes
// the budget); reset empties the buffer and setTitle sets `title`. A `failure`
// makes every call throw it, as a host without the session tools does.
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

  check(): void {
    if (this.failure) throw this.failure;
  }

  async readMessages(): Promise<SessionMessages> {
    this.check();
    return { stored: [...this.messages], messages: this.messages.map((m) => ({ role: m.role, content: m.content })) };
  }

  async writeMessages(messages: readonly StoredMessage[]): Promise<void> {
    this.check();
    this.messages = [...messages] as SessionMsg[];
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
    this.check();
    return this.state.get(key) ?? null;
  }

  async writeState(key: string, value: string | null): Promise<void> {
    this.check();
    if (value === null) this.state.delete(key);
    else this.state.set(key, value);
  }

  async readBudget(): Promise<TokenBudget> {
    this.check();
    return this.budget;
  }
}
