// FakeMemoryStore: the MemoryStore port over `records`, in stored order. add()
// appends a record under the next id; get() answers the record itself, remove()
// drops it. A category listed in `failing` throws on list() and add(), as an
// unavailable category does; `unavailable` makes every list() throw. `listed` records
// the category of each list() call, undefined for every category.
import type { MemoryEntry, MemoryStore } from "../../../src/shared/application/ports.ts";

export class FakeMemoryStore implements MemoryStore {
  records: Array<{ id: number; category: string; content: string }> = [];
  failing = new Set<string>();
  unavailable = false;
  listed: Array<string | undefined> = [];

  async list(category?: string): Promise<MemoryEntry[]> {
    this.listed.push(category);
    if (this.unavailable) throw new Error("memory store unavailable");
    if (category !== undefined && this.failing.has(category)) {
      throw new Error(`memory category unavailable: ${category}`);
    }
    return this.records.filter((r) => category === undefined || r.category === category).map((r) => ({ ...r }));
  }

  async add(category: string, content: string): Promise<string> {
    if (this.failing.has(category)) throw new Error(`memory category unavailable: ${category}`);
    const id = Math.max(0, ...this.records.map((r) => r.id)) + 1;
    this.records.push({ id, category, content });
    return String(id);
  }

  async get(id: number): Promise<unknown> {
    return this.records.find((r) => r.id === id);
  }

  async remove(id: number): Promise<boolean> {
    const kept = this.records.filter((r) => r.id !== id);
    const removed = kept.length < this.records.length;
    this.records = kept;
    return removed;
  }
}
