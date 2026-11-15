// The markers of the spec writer's prompt: one per rule of form the prompt states.
export const FORM_MARKERS: ReadonlyArray<[rule: string, marker: string]> = [
  ["the name's length and its long dash", "name: one line of at most 80 characters, without a long dash"],
  ["a rule's statement", "one line of at most 200 characters"],
  ["one line per field", "is one line, without '|'"],
  ["the counts and a question's length", "At most 12 use cases, 24 rules and 12 questions; a question is one line of at most 300 characters"],
  ["a data row's source", "source is one of entered, computed, imported, catalogue"],
  ["a data row's importance", "importance one of essential, secondary, expert"],
  ["an option's form", "each on one line of at most 120 characters, without ';' nor '|'"],
];
