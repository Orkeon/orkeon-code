// Guards, rule sets, arguments and outputs the tool guards are tested on.
import type { Guard } from "./tool-guards.ts";
import type { RuleSetId } from "../agent-policy/rule-sets.ts";

/** Guards that record their name in `seen` when called: one that passes, one that refuses. */
export function recordingGuards(): { seen: string[]; pass: (name: string) => Guard<string>; refuse: (name: string) => Guard<string> } {
  const seen: string[] = [];
  const pass = (name: string): Guard<string> => () => { seen.push(name); return null; };
  const refuse = (name: string): Guard<string> => () => { seen.push(name); return `${name} refuses`; };
  return { seen, pass, refuse };
}

/** A guard that throws. */
export const boom: Guard<string> = () => { throw new Error("bad pattern"); };

export interface RuleCase {
  name: string;
  sets: RuleSetId[];
  command: string;
  expected: string | null;
}

/** Commands a deny rule of the step covers, and others it lets through. */
export const RULE_CASES: readonly RuleCase[] = [
  {
    name: "a push under git-readonly", sets: ["git-readonly"], command: "git push origin main",
    expected: "the rules of this step deny the shell command 'git push origin main'",
  },
  { name: "a test run under git-readonly", sets: ["git-readonly"], command: "dotnet test tests/A.Tests", expected: null },
  {
    name: "a git config set under git-readonly", sets: ["git-readonly"], command: "git config user.name x",
    expected: "the rules of this step deny the shell command 'git config user.name x'",
  },
  { name: "a git config list of a file under git-readonly", sets: ["git-readonly"], command: "git config --file a.cfg --list", expected: null },
  { name: "a git config set under inline-interpreters only", sets: ["inline-interpreters"], command: "git config user.name x", expected: null },
];

/** The rule sets the received-form cases run under. */
export const READONLY_AND_INTERPRETERS: readonly RuleSetId[] = ["git-readonly", "inline-interpreters"];

/** Inline-interpreter commands, the flag glued to its code or quoted: each refused. */
export const INLINE_FORMS: readonly string[] = [
  "python3 -Ic x", 'python3 -Ic"print(1)"', "python3 -Icprint(1)", 'perl -we"print 1"', 'perl -wE"say 1"', 'ruby -we"p 1"',
];

export interface ArgumentCase {
  name: string;
  input: unknown;
  key: string;
  required: boolean;
  expected: { value?: string } | { refused: string };
}

export const ARGUMENT_CASES: readonly ArgumentCase[] = [
  { name: "a value, trimmed", input: { command: " npm test " }, key: "command", required: true, expected: { value: "npm test" } },
  { name: "nothing for an optional key absent", input: {}, key: "project", required: false, expected: {} },
  { name: "a required key absent", input: null, key: "command", required: true, expected: { refused: "'command' is required" } },
  { name: "a number", input: { command: 3 }, key: "command", required: true, expected: { refused: "'command' is not a string" } },
  {
    name: "two lines", input: { command: "a\nb" }, key: "command", required: true,
    expected: { refused: "'command' is not one line of at most 400 characters" },
  },
  {
    name: "401 characters", input: { command: "x".repeat(401) }, key: "command", required: true,
    expected: { refused: "'command' is not one line of at most 400 characters" },
  },
];

/** Twenty numbered lines. */
export const TWENTY_LINES = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
