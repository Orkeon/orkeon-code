// The briefs runExplorer refuses, and the rules of the explorer's system message with the marker that pins each one
// (docs/turn.md, "The explorer").
import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";

export interface RefusedBriefCase {
  name: string;
  input: unknown;
  error: RegExp;
}

export const REFUSED_BRIEFS: readonly RefusedBriefCase[] = [
  { name: "an empty brief", input: "   ", error: /explorer: the brief is empty/ },
  { name: "an input that is not text", input: { brief: "b" }, error: /explorer: the brief is empty/ },
  {
    name: "a brief over MAX_BRIEF_CHARS",
    input: "x".repeat(MAX_BRIEF_CHARS + 1),
    error: new RegExp(`over ${MAX_BRIEF_CHARS}; send a shorter one`),
  },
];

export const EXPLORER_RULE_MARKERS: Record<string, string> = {
  "the brief alone: nothing else comes with it": "no conversation, no project instructions, no earlier turn",
  "nothing assumed past the brief": "Do not assume what the brief leaves out",
  "changes nothing": "never present a change as made",
  "searches before it reads": "Search before you read",
  "independent reads go out together": "go out together, in one message",
  "a cut result is not the whole": "a name missing from it is not absent",
  "narrows before saying something does not exist": "before you say something does not exist",
  "stops once answered": "Stop reading once the brief is answered",
  "a short report": "a few hundred words",
  "the answer first": "the answer to the brief first",
  "each fact with its path:line": "each fact with the `path:line` it rests on",
  "what is not established is said, never guessed": "said as such, never guessed",
  "no file dump": "no file content beyond the few lines a fact needs",
  "the brief's language": "Write in the language of the brief",
};
