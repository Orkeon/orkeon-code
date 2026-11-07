// The typed-memory port: the entries that outlive compaction, and the session when the runtime persists them.
// Types only, re-exported by ../ports.ts.

/** A typed-memory entry as listed. */
export interface MemoryEntry {
  /** The id /memory get and delete take; undefined when the host reports none. */
  id?: number;
  /** Undefined when the host reports none. */
  category?: string;
  content: string;
}

/** Typed memory (user, project, feedback, reference), which outlives compaction, and the session when the runtime
 *  keeps it per project (`Orkeon:Cli:Memory:Persist`, Orkeon #286). Every call throws when the store cannot answer. */
export interface MemoryStore {
  /** The entries of one category, or of every category when none is named, in stored order, or the newest first
   *  when `newestFirst` is set (Orkeon #286). */
  list(category?: string, options?: { newestFirst?: boolean }): Promise<MemoryEntry[]>;
  /** Store an entry; resolves to its id as the host reports it, as text (`null` or
   *  `undefined` when it reports none): /memory add prints it as is. */
  add(category: string, content: string): Promise<string>;
  /** The entry `id` as the host reports it, its own field casing included (/memory get
   *  prints it verbatim), else the host's error; undefined when it reports neither. */
  get(id: number): Promise<unknown>;
  /** Delete the entry `id`; false when the host does not report a success. */
  remove(id: number): Promise<boolean>;
  /** Put `content` in place of the entry `id`'s, which keeps its id and category (Orkeon #286); false when the host
   *  does not report a success. */
  replace(id: number, content: string): Promise<boolean>;
}
