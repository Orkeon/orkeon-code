// Lines typed after /dev-spec and /dev-change, and what each reads to.
import type { DevChangeArgs, DevSpecArgs } from "../src/commands/_lib/dev-source.ts";

/** The tokens the REPL hands over: the line split on spaces, quotes kept. */
export const tokens = (line: string): string[] => line.split(" ").filter((t) => t !== "");

export const SPEC_READ_CASES: readonly { name: string; line: string; args: DevSpecArgs }[] = [
  { name: "a code and a brief", line: "prune Remove old entries, keep feedback.", args: { code: "prune", request: "Remove old entries, keep feedback." } },
  { name: "a code alone", line: "prune", args: { code: "prune", request: "" } },
  { name: "a code and a quoted brief", line: 'prune "one quoted brief"', args: { code: "prune", request: "one quoted brief" } },
];

export const SPEC_REFUSED_CASES: readonly { name: string; line: string; start: string }[] = [
  { name: "a bad code", line: "../x brief", start: "'../x' is not a code" },
  { name: "an option", line: "prune --replace", start: "unknown option --replace" },
];

export const CHANGE_READ_CASES: readonly { name: string; line: string; args: DevChangeArgs }[] = [
  {
    name: "the kind, a quoted --run command whole and the origin",
    line: 'cache bug --run "node --test tests/map.test.ts" #42',
    args: { code: "cache", kind: "bug", run: "node --test tests/map.test.ts", text: "#42" },
  },
  {
    name: "the kind and a text origin",
    line: "cache refactor The map is read on every call.",
    args: { code: "cache", kind: "refactor", run: "", text: "The map is read on every call." },
  },
  { name: "no kind, the origin alone", line: "cache also pin the absent map", args: { code: "cache", kind: "", run: "", text: "also pin the absent map" } },
];

export const CHANGE_REFUSED_CASES: readonly { name: string; line: string; start: string }[] = [
  { name: "--run without its command", line: "cache bug --run", start: "--run needs the command" },
  { name: "--run after the origin", line: 'cache bug the map --run "x"', start: "--run comes before the origin" },
  { name: "another option", line: "cache bug --replace", start: "unknown option --replace" },
];

export const FORK_STEPS = ["dev-spec", "dev-change"] as const;
