// The replies of memory_store the createMemoryStore tests read ids and entries from.

export interface AddedIdCase {
  name: string;
  reply: unknown;
  /** The id add returns, as text. */
  id: string;
}

/** The id of an added entry, read in either casing, and as /memory add prints a null or missing one. */
export const ADDED_IDS: readonly AddedIdCase[] = [
  { name: "reads back a PascalCase id as text", reply: { Id: 8 }, id: "8" },
  { name: "reads an id the host reports as null as /memory add prints it", reply: { id: null }, id: "null" },
  { name: "reads an id the host does not report as /memory add prints it", reply: {}, id: "undefined" },
  { name: "reads back a text id as it is", reply: { id: "m-12" }, id: "m-12" },
];

export interface GetCase {
  name: string;
  reply: unknown;
  id: number;
  expected: unknown;
}

/** What get returns when the host reports no entry. */
export const GETS_WITHOUT_ENTRY: readonly GetCase[] = [
  { name: "gets the host's error when it reports one", reply: { error: "no entry 4" }, id: 4, expected: "no entry 4" },
  { name: "gets undefined when the host reports neither entry nor error", reply: {}, id: 5, expected: undefined },
];
