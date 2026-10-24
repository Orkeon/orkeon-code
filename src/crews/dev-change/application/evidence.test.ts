// The evidence a change brief stands on: which command may run (a narrow test command of the pack, or the CLI and
// plain words that stay in the checkout), and which run stops the step (a bug that does not fail or never ran, a
// failed measurement, a timeout).
// Run:  node --test src/crews/dev-change/application/evidence.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import { commandProblem, runStop } from "./evidence.ts";
import type { Ran } from "./evidence.ts";

const PACK: RepoPackCommands = { testClass: "node --test <Class>", test: "npm test", cli: "node bin/orkeon.mjs" };
const ran = (over: Partial<Ran>): Ran => ({ command: "node --test tests/a.test.ts", exitCode: 1, seconds: 1, timedOut: false, output: "", refused: false, ...over });

describe("commandProblem", () => {
  it("accepts the CLI with plain words inside the checkout, and a narrow test command", () => {
    strictEqual(commandProblem("node bin/orkeon.mjs run src/crews/x/crew.ork.ts --inputs \"{}\"", PACK), null);
    strictEqual(commandProblem("node bin/orkeon.mjs --version", PACK), null);
    strictEqual(commandProblem("node bin/orkeon.mjs -o out/x.txt level=2 --dir=src/a", PACK), null);
    strictEqual(commandProblem("node --test tests/a.test.ts", PACK), null);
  });

  it("refuses after the CLI a path out of the checkout, a glob, an expansion or a shell operator", () => {
    for (const c of [
      "node bin/orkeon.mjs run /tmp/x.ork.ts", "node bin/orkeon.mjs --config=/etc/passwd", "node bin/orkeon.mjs run ~/x.ts",
      "node bin/orkeon.mjs run ../x.ts", "node bin/orkeon.mjs run a/../../x.ts", "node bin/orkeon.mjs run src/*.ts",
      "node bin/orkeon.mjs run $HOME", "node bin/orkeon.mjs run x; rm -rf .",
      "node bin/orkeon.mjs -o/etc/passwd", "node bin/orkeon.mjs out=..", "node bin/orkeon.mjs dir=a/../../x", "node bin/orkeon.mjs -C~",
      "node bin/orkeon.mjs -xf/etc/x", "node bin/orkeon.mjs --a=b=/etc",
    ]) ok(commandProblem(c, PACK) !== null, c);
    ok(commandProblem("npm test", PACK) !== null, "the whole suite is no narrow command");
    ok(commandProblem("node bin/orkeon.mjs\nrm x", PACK) !== null, "one line");
  });
});

describe("runStop", () => {
  it("a bug reproduces only when its command ran and failed", () => {
    strictEqual(runStop("dev-change", "bug", ran({ exitCode: 1 }), "f"), null);
    ok(runStop("dev-change", "bug", ran({ exitCode: 0 }), "f")?.includes("did not reproduce"));
    ok(runStop("dev-change", "bug", ran({ exitCode: 127 }), "f")?.includes("could not start"));
    ok(runStop("dev-change", "bug", ran({ exitCode: 126 }), "f")?.includes("could not start"));
    ok(runStop("dev-change", "bug", ran({ exitCode: 137 }), "f")?.includes("was killed"));
    ok(runStop("dev-change", "bug", ran({ refused: true, output: "no" }), "f")?.includes("could not run"));
    ok(runStop("dev-change", "bug", ran({ timedOut: true }), "f")?.includes("ran out"));
  });

  it("a measurement stands only when it exits 0", () => {
    strictEqual(runStop("dev-change", "perf", ran({ exitCode: 0 }), "f"), null);
    ok(runStop("dev-change", "perf", ran({ exitCode: 1 }), "f")?.includes("measurement failed"));
  });
});
