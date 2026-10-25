// scripts/dev-run.sh over a fake runner (DEV_RUN_RUNNER): each case scripts what each step
// prints, appends to the work code's event log and exits with. No orkeon, no network. Run:
//   node --test tests/dev-run.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  BAD_ARGS, BAD_INVOCATIONS, CLOSED, CLOSED_READINGS, CREW_EXITS, F1_LAUNCHED, HUMAN_DECISIONS, LOG_OPTION, NOTHING,
  run, runUntrusted, RUNTIME_ERRORS, SCRIPT,
} from "./dev-run.fixtures.ts";
import { assertExit } from "./dev-run.assertions.ts";

describe("scripts/dev-run.sh", () => {
  it("parses as bash", () => {
    // Arrange
    const script = SCRIPT;

    // Act
    const r = spawnSync("bash", ["-n", script]);

    // Assert
    strictEqual(r.status, 0);
  });

  it("runs steps until the log says closed, each output in its own log file, the last line shown", () => {
    // Arrange
    const plan = ["0|- 2026-10-24 09:00 F1 launched|step one done", "0|- 2026-10-24 09:30 closed|all closed"];

    // Act
    const r = run(plan);

    // Assert
    strictEqual(r.status, 0, r.stdout + r.stderr);
    strictEqual(r.count, 2);
    deepStrictEqual(r.logs, ["dev-verify-1.log", "dev-verify-2.log"]);
    strictEqual(r.firstLog, "working\nstep one done\n");
    ok(r.stdout.includes("  last line: step one done"), r.stdout);
    ok(!r.stdout.includes("working"), "the whole output stays in the log");
    ok(r.firstArgs.endsWith(`/src/crews/dev-verify/crew.ork.ts --inputs {"code":"demo"}`), r.firstArgs);
  });

  it("runs each step with no stdin (/dev/null), so nothing a step asks can hang the chain", () => {
    // Arrange
    const plan = ["0|- 2026-10-24 09:00 F1 launched|", CLOSED];

    // Act
    const r = run(plan);

    // Assert
    deepStrictEqual(r.stdin, ["device", "device"]);
  });

  for (const c of CLOSED_READINGS) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  it("refuses the crew dev-batches with 64, running nothing", () => {
    // Arrange
    const crew = "dev-batches";

    // Act
    const r = run([CLOSED], [], crew);

    // Assert
    strictEqual(r.status, 64);
    strictEqual(r.count, 0);
    ok(r.stderr.includes("stays the REPL's /dev-batches"), r.stderr);
  });

  it("without DEV_RUN_RUNNER, checks the project's trust once before any step: refused without a terminal, exit 2", () => {
    // Arrange
    const start = runUntrusted;

    // Act
    const r = start();

    // Assert
    strictEqual(r.status, 2, r.stdout + r.stderr);
    ok(r.stderr.includes(`trust ${r.project} first`), r.stderr);
    ok(!r.ranStep, "no step ran");
    ok(!r.createdOrkeon, "nothing is created in an untrusted project");
  });

  it("passes the inputs given", () => {
    // Arrange
    const args = ["--inputs", `{"batch":"F2"}`];

    // Act
    const r = run([CLOSED], args);

    // Assert
    strictEqual(r.status, 0, r.stdout + r.stderr);
    ok(r.firstArgs.endsWith(`/src/crews/dev-verify/crew.ork.ts --inputs {"batch":"F2"}`), r.firstArgs);
  });

  for (const c of HUMAN_DECISIONS) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  for (const c of LOG_OPTION) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  it("stops with 4 when a step moved nothing, never looping", () => {
    // Arrange
    const plan = [F1_LAUNCHED, NOTHING, NOTHING];

    // Act
    const r = run(plan);

    // Assert
    strictEqual(r.status, 4);
    strictEqual(r.count, 2);
  });

  it("waits and runs a rate-limited step again, then goes on", () => {
    // Arrange
    const plan = ["2||HTTP 429 Too Many Requests", CLOSED];

    // Act
    const r = run(plan);

    // Assert
    strictEqual(r.status, 0, r.stdout);
    strictEqual(r.count, 2);
    ok(r.stdout.includes("rate limited"));
  });

  for (const c of RUNTIME_ERRORS) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  for (const c of CREW_EXITS) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  it("stops with 5 at --max-steps", () => {
    // Arrange
    const plan = [F1_LAUNCHED, "0|- 2026-10-24 09:10 F2 launched|", NOTHING];

    // Act
    const r = run(plan, ["--max-steps", "2"]);

    // Assert
    strictEqual(r.status, 5);
    strictEqual(r.count, 2);
  });

  for (const c of BAD_ARGS) {
    it(c.name, () => {
      // Arrange
      const { plan, args } = c;

      // Act
      const r = run(plan, args);

      // Assert
      assertExit(r, c);
    });
  }

  for (const c of BAD_INVOCATIONS) {
    it(c.name, () => {
      // Arrange
      const argv = [SCRIPT, ...c.argv];

      // Act
      const r = spawnSync("bash", argv, { encoding: "utf-8" });

      // Assert
      strictEqual(r.status, 64);
    });
  }
});
