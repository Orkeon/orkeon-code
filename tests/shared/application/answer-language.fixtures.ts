// The config stores the answer-language tests read.

/** A language store answering `value` for every key, from a file. */
export function languageStore(value: string | undefined) {
  return {
    readValue: async (key: string) => ({ key, value, source: "file" as const }),
  };
}

/** Stores no language is read from: none, one without a value, one that cannot be read. */
export const NO_LANGUAGE = [
  { name: "without a store", store: undefined },
  { name: "without a value", store: languageStore(undefined) },
  { name: "without a readable store", store: { readValue: async (): Promise<never> => { throw new Error("unreadable"); } } },
];
