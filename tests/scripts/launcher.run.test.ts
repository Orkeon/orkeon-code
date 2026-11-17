// `orkeon-code run <crew>`: one crew, headless, through `orkeon run`, with the REPL's project, trust, settings and
// mounts. The launcher runs for real over stand-ins of the runners, which record what they were given.
import { after, describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FINGERPRINT, FINGERPRINT_PATH, launch, launchWithNode, removeScratch } from "./launcher.fixtures.ts";
import { assertLacks, assertSays } from "./launcher.assertions.ts";
import {
  DOCKER_CREW, DOCKER_OUTSIDE_SRC, DOTNET_BIN, DOWNLOADED_RAN, ELSEWHERE, MOCK_IN_CONTAINER, MOCK_ON_HOST, INPUTS, INPUTS_ARE_RUNS, LOG_TO_STDERR, NAMED_RUNTIME, NO_SESSION,
  NO_ESBUILD, NO_ESBUILD_NAMED, NO_SOURCE, NPM_ESBUILD, NPM_ESBUILD_FILE, ORKEON, PROBE, TOOL_MANIFEST, UNKNOWN, USAGE, agentMount, cloneToolCalls, crewPath, homeWithOrkeon, orkeonExiting, runArgs,
  runStart, scriptingCheckout, sourceCalls,
} from "./launcher.run.fixtures.ts";
import { assertArgsEndWith, assertArgsHold, assertCalls, assertNothingRun, assertRunnerArgs } from "./launcher.run.assertions.ts";

after(removeScratch);

describe("orkeon-code run, the crew", () => {
  it("resolves a crew's name to its crew.ork.ts and hands orkeon run the settings and the REPL's four mounts", () => {
    // Arrange
    const start = runStart();

    // Act
    const r = launch(start);

    // Assert
    assertRunnerArgs(r, runArgs(r));
  });

  it("keeps the path of a crew script given as a path, a probe of the clone", () => {
    // Arrange
    const start = runStart({ crew: PROBE });

    // Act
    const r = launch(start);

    // Assert
    assertRunnerArgs(r, runArgs(r, crewPath(r, "src/crews/_probe-x/probe.ork.ts")));
  });

  it("refuses a name that is no crew, naming the crews but the probes", () => {
    // Arrange
    const start = runStart({ crew: "nope" });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, UNKNOWN);
    assertLacks(r.stderr, ["_probe-x"], "a probe is no crew to run by name");
  });

  it("refuses a run with no crew, with its usage", () => {
    // Arrange
    const start = { ...runStart(), before: ["run"] };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, USAGE);
  });
});

describe("orkeon-code run, the arguments", () => {
  it("passes --inputs to orkeon run", () => {
    // Arrange
    const start = runStart({ args: ["--inputs", INPUTS] });

    // Act
    const r = launch(start);

    // Assert
    assertArgsEndWith(r, ["--inputs", INPUTS]);
  });

  it("passes what follows -- to orkeon run, after the inputs", () => {
    // Arrange
    const start = runStart({ args: [`--inputs=${INPUTS}`, "--", "--llm-mock", "answers.jsonl"] });

    // Act
    const r = launch(start);

    // Assert
    assertArgsEndWith(r, ["--inputs", INPUTS, "--llm-mock", "answers.jsonl"]);
  });

  it("refuses --continue, a run being one turn with no session", () => {
    // Arrange
    const start = runStart({ args: ["--continue"] });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, NO_SESSION);
  });

  it("refuses --inputs at a start of the REPL", () => {
    // Arrange
    const start = { ...runStart({ args: ["--inputs", INPUTS] }), before: [] };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, INPUTS_ARE_RUNS);
  });
});

describe("orkeon-code run, the start", () => {
  it("ends with the runner's own exit code", () => {
    // Arrange
    const start = runStart({ bin: orkeonExiting(75) });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 75, r.stderr);
  });

  it("runs an untrusted project with --trust, for this run, never forwarded to orkeon run", () => {
    // Arrange
    const start = runStart({ trusted: false, args: ["--trust"] });

    // Act
    const r = launch(start);

    // Assert
    assertRunnerArgs(r, runArgs(r));
  });

  it("hands the runner ORKEON_CODE_MODEL as the model", () => {
    // Arrange
    const start = runStart({ env: { ORKEON_CODE_MODEL: "m-live" } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.env.get("ORKEON_Llm__Model"), "m-live");
  });

  it("points the embedding fingerprint at /output, outside the project", () => {
    // Arrange
    const start = runStart();

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.env.get(FINGERPRINT), FINGERPRINT_PATH);
  });

  it("refuses an untrusted project with exit 3 where there is no terminal to ask in, running nothing", () => {
    // Arrange
    const start = runStart({ trusted: false });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 3, r.stderr);
    assertNothingRun(r);
  });

  it("sends the runner's log lines to stderr, so that stdout carries the result alone", () => {
    // Arrange
    const start = runStart();

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.env.get(LOG_TO_STDERR), "Trace");
  });

  it("runs from the project", () => {
    // Arrange
    const start = runStart();

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.cwd, r.project);
  });

  it("hands the crew the user's orkeonCode block on /user-config", () => {
    // Arrange
    const start = runStart({ settings: { Llm: { Model: "m" }, orkeonCode: { language: "fr" } } });

    // Act
    const r = launchWithNode(start);

    // Assert
    deepStrictEqual(JSON.parse(readFileSync(join(r.state, "user-config", "config.json"), "utf-8")), { language: "fr" });
  });
});

describe("orkeon-code run, the runner", () => {
  it("runs the command line ORKEON_CLI names before an orkeon on PATH", () => {
    // Arrange
    const start = runStart({ bin: { ...ORKEON, "my-orkeon": ORKEON.orkeon }, env: { ORKEON_CLI: "my-orkeon --flag" } });

    // Act
    const r = launch(start);

    // Assert
    assertRunnerArgs(r, ["--flag", ...runArgs(r)]);
  });

  it("runs the downloaded runtime's bin/orkeon in an install with no orkeon on PATH", () => {
    // Arrange
    const start = runStart({ bin: {}, install: true, files: NAMED_RUNTIME, env: { ORKEON_CODE_HOME: homeWithOrkeon() } });

    // Act
    const r = launch(start);

    // Assert
    assertCalls(r, [DOWNLOADED_RAN]);
  });

  it("restores and runs the clone's dotnet tool, from the clone, with no orkeon on PATH", () => {
    // Arrange
    const start = runStart({ bin: DOTNET_BIN, files: TOOL_MANIFEST });

    // Act
    const r = launch(start);

    // Assert
    assertCalls(r, cloneToolCalls(r));
  });

  it("gives the clone's dotnet tool the esbuild npm ci installed, since the tool carries none", () => {
    // Arrange
    const start = runStart({ bin: DOTNET_BIN, files: { ...TOOL_MANIFEST, ...NPM_ESBUILD_FILE }, env: NO_ESBUILD_NAMED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.env.get("ORKEON_ESBUILD_PATH"), join(r.root, NPM_ESBUILD));
  });

  it("stops before the clone's dotnet tool is restored when no esbuild is installed", () => {
    // Arrange
    const start = runStart({ bin: DOTNET_BIN, files: TOOL_MANIFEST, env: NO_ESBUILD_NAMED });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, NO_ESBUILD);
    deepStrictEqual(r.calls, []);
  });

  it("stops source mode when ORKEON_SOURCE names no Orkeon checkout, running nothing", () => {
    // Arrange
    const start = runStart({ bin: DOTNET_BIN, args: ["--mode", "source"], env: { ORKEON_SOURCE: "/nowhere" } });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, NO_SOURCE);
    deepStrictEqual(r.calls, []);
  });

  it("builds the Scripting CLI of ORKEON_SOURCE in source mode, then runs its assembly", () => {
    // Arrange
    const source = scriptingCheckout();
    const start = runStart({ bin: DOTNET_BIN, args: ["--mode", "source"], env: { ORKEON_SOURCE: source } });

    // Act
    const r = launch(start);

    // Assert
    assertCalls(r, sourceCalls(source, r));
  });

  it("runs the image's orkeon in docker mode, the crew read from the checkout mounted read-only", () => {
    // Arrange
    const start = runStart({ bin: { docker: ORKEON.orkeon }, args: ["--mode", "docker"] });

    // Act
    const r = launch(start);

    // Assert
    assertArgsHold(r, DOCKER_CREW);
    assertArgsHold(r, ["-v", agentMount(r)]);
    assertArgsHold(r, ["-e", "ORKEON_ENTRYPOINT=orkeon"]);
  });

  it("refuses in docker mode a crew that lies outside the checkout", () => {
    // Arrange
    const start = runStart({ crew: "elsewhere.ork.ts", bin: { docker: ORKEON.orkeon }, args: ["--mode", "docker"], files: ELSEWHERE });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, DOCKER_OUTSIDE_SRC);
  });

  it("names a file of the checkout given after -- as the container sees it, in docker mode", () => {
    // Arrange
    const start = runStart({ bin: { docker: ORKEON.orkeon }, args: MOCK_ON_HOST, checkoutInArgs: true });

    // Act
    const r = launch(start);

    // Assert
    assertArgsEndWith(r, MOCK_IN_CONTAINER);
  });

  it("writes nothing in the state before the runner is known", () => {
    // Arrange
    const start = runStart({ bin: { docker: ORKEON.orkeon }, args: ["--mode", "docker"], crew: "elsewhere.ork.ts", files: ELSEWHERE });

    // Act
    const r = launch(start);

    // Assert
    strictEqual(existsSync(join(r.state, "user-config")), false);
  });
});
