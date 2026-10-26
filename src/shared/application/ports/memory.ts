// The typed-memory port: the entries that outlive compaction.
// Types only, re-exported by ../ports.ts.

/** A typed-memory entry as listed. */
export interface MemoryEntry {
  /** The id /memory get and delete take; undefined when the host reports none. */
  id?: number;
  /** Undefined when the host reports none. */
  category?: string;
  content: string;
}

/** Typed memory (user, project, feedback, reference), which outlives compaction.
 *  Every call throws when the store cannot answer. */
export interface MemoryStore {
  /** The entries of one category, or of every category when none is named, in stored order. */
  list(category?: string): Promise<MemoryEntry[]>;
  /** Store an entry; resolves to its id as the host reports it, as text (`null` or
   *  `undefined` when it reports none): /memory add prints it as is. */
  add(category: string, content: string): Promise<string>;
  /** The entry `id` as the host reports it, its own field casing included (/memory get
   *  prints it verbatim), else the host's error; undefined when it reports neither. */
  get(id: number): Promise<unknown>;
  /** Delete the entry `id`; false when the host does not report a success. */
  remove(id: number): Promise<boolean>;
}
