// The pack, runs and commands the evidence tests read.
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { Ran } from "./evidence.ts";

export const PACK: RepoPackCommands = { testClass: "node --test <Class>", test: "npm test", cli: "node bin/orkeon.mjs" };

/** A narrow test command that ran and failed in a second, `over` replacing some fields. */
export const ran = (over: Partial<Ran>): Ran => ({
  command: "node --test tests/a.test.ts", exitCode: 1, seconds: 1, timedOut: false, output: "", refused: false, ...over,
});

/** The CLI with plain words inside the checkout, and a narrow test command. */
export const ACCEPTED_COMMANDS: readonly string[] = [
  "node bin/orkeon.mjs run src/crews/x/crew.ork.ts --inputs \"{}\"",
  "node bin/orkeon.mjs --version",
  "node bin/orkeon.mjs -o out/x.txt level=2 --dir=src/a",
  "node --test tests/a.test.ts",
];

export interface RefusedCommandCase {
  name: string;
  command: string;
}

const afterCli = (command: string): RefusedCommandCase => ({ name: `after the CLI: ${command}`, command });

/** After the CLI a path out of the checkout, a glob, an expansion or a shell operator; the whole suite; two lines. */
export const REFUSED_COMMANDS: readonly RefusedCommandCase[] = [
  ...[
    "node bin/orkeon.mjs run /tmp/x.ork.ts", "node bin/orkeon.mjs --config=/etc/passwd", "node bin/orkeon.mjs run ~/x.ts",
    "node bin/orkeon.mjs run ../x.ts", "node bin/orkeon.mjs run a/../../x.ts", "node bin/orkeon.mjs run src/*.ts",
    "node bin/orkeon.mjs run $HOME", "node bin/orkeon.mjs run x; rm -rf .",
    "node bin/orkeon.mjs -o/etc/passwd", "node bin/orkeon.mjs out=..", "node bin/orkeon.mjs dir=a/../../x", "node bin/orkeon.mjs -C~",
    "node bin/orkeon.mjs -xf/etc/x", "node bin/orkeon.mjs --a=b=/etc",
  ].map(afterCli),
  { name: "the whole suite: it is no narrow command", command: "npm test" },
  { name: "a command of two lines: one line only", command: "node bin/orkeon.mjs\nrm x" },
];

export interface StopCase {
  name: string;
  ran: Ran;
  says: string;
}

/** Bug runs that stop the step, and what the stop says. */
export const BUG_STOPS: readonly StopCase[] = [
  { name: "a run that passed", ran: ran({ exitCode: 0 }), says: "did not reproduce" },
  { name: "a run exiting 127", ran: ran({ exitCode: 127 }), says: "could not start" },
  { name: "a run exiting 126", ran: ran({ exitCode: 126 }), says: "could not start" },
  { name: "a run exiting 137", ran: ran({ exitCode: 137 }), says: "was killed" },
  { name: "a refused run", ran: ran({ refused: true, output: "no" }), says: "could not run" },
  { name: "a run that timed out", ran: ran({ timedOut: true }), says: "ran out" },
];
