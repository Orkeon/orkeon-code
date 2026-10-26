// Session buffers and exchanges the advice tests read.

/** One message of a session buffer. */
export const M = (role: string, content: string) => ({ role, content });

/** Two answered questions, then a user line typed after the last answer. */
export const TWO_EXCHANGES_THEN_A_LINE = [
  M("user", "first question"),
  M("assistant", "first answer"),
  M("user", "second question"),
  M("assistant", "second answer"),
  M("user", "something typed after"),
];

export interface NoAssistantCase {
  name: string;
  messages: Array<{ role: string; content: string }>;
}

/** Buffers without an assistant turn. */
export const NO_ASSISTANT_BUFFERS: readonly NoAssistantCase[] = [
  { name: "a buffer holding a user turn only", messages: [M("user", "hi")] },
  { name: "an empty buffer", messages: [] },
];

/** The exchange the prompt tests build on. */
export const EXCHANGE = { request: "do the thing", answer: "I did the thing" };

/** The exchange the reviewer's brief tests build on, and the earlier turns handed with it. */
export const LATER_EXCHANGE = { request: "also reject duplicates", answer: "Done." };
export const EARLIER = "user: add input validation\nassistant: added it";

/** Three answered turns. */
export const THREE_TURNS = [
  { role: "user", content: "u1" }, { role: "assistant", content: "a1" },
  { role: "user", content: "u2" }, { role: "assistant", content: "a2" },
  { role: "user", content: "u3" }, { role: "assistant", content: "a3" },
];

export interface NoEarlierCase {
  name: string;
  messages: Array<{ role: string; content: string }>;
}

/** Buffers with no turn before the reviewed request. */
export const NO_EARLIER_TURNS: readonly NoEarlierCase[] = [
  { name: "one answered turn", messages: THREE_TURNS.slice(0, 2) },
  { name: "an empty buffer", messages: [] },
];
