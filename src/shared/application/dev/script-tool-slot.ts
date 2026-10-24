// The slot a script tool reads what it calls from (shared/infrastructure/orkeon/script-tools.ts): a crew
// builds its tools before its agent's body runs, and the body, once it knows its pack and its rules,
// binds the slot for its run and releases it at the end. Two runs of one crew bound at once would mix
// their calls, so the slot then gives nothing until one of them releases it.

/** What a tool calls, filled by the agent's body once it knows its pack. */
export interface ScriptToolSlot<T> {
  /** Binds `value` for one run; the function returned releases it. */
  bind(value: T): () => void;
  /** The value of the one run bound; undefined when none is, or when two are. */
  get(): T | undefined;
}

export function scriptToolSlot<T>(): ScriptToolSlot<T> {
  const bound: Array<{ value: T }> = [];
  return {
    bind(value) {
      const entry = { value };
      bound.push(entry);
      return () => {
        const at = bound.indexOf(entry);
        if (at >= 0) bound.splice(at, 1);
      };
    },
    get: () => (bound.length === 1 ? bound[0].value : undefined),
  };
}
