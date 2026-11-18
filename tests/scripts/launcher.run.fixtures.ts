// The data of launcher.run.test.ts: `orkeon-code run <crew>` over stand-ins of the runners (orkeon, dotnet, docker),
// a checkout holding two crews and a probe, and the arguments the launcher is expected to hand `orkeon run`.
import { chmodSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WORKSPACE } from "../../src/shared/domain/vfs.ts";
import { DOTNET, ESBUILD, recorder, scratchDir } from "./launcher.fixtures.ts";
import type { LaunchOptions, Run } from "./launcher.fixtures.ts";
import { AGREED, installStart, pathWithoutRuntime } from "./launcher.runtime.fixtures.ts";

export const LOG_TO_STDERR = "Logging__Console__LogToStandardErrorThreshold";
export const IMAGE = "ghcr.io/orkeon/orkeon:latest";
export const ELSEWHERE = { "elsewhere.ork.ts": "" };
export const PROBE = "checkout/src/crews/_probe-x/probe.ork.ts";

/** The crews of the checkout a launch copies: two crews and a `_` probe, which no name reaches. */
const CREWS = {
  "checkout/src/crews/main-loop/crew.ork.ts": "// crew\n",
  "checkout/src/crews/git-commit/crew.ork.ts": "// crew\n",
  [PROBE]: "// probe\n",
};

export const ORKEON = { orkeon: recorder() };
/** An orkeon whose run ends with `code`, as the runner's own exit (75: the step asks to be run again). */
export const orkeonExiting = (code: number) => ({ orkeon: `${recorder()}exit ${code}\n` });

export interface RunStart {
  crew?: string; args?: string[]; bin?: Record<string, string>; env?: Record<string, string>; files?: Record<string, string>;
  install?: boolean; trusted?: boolean; systemPath?: string; settings?: Record<string, unknown>; checkoutInArgs?: boolean;
}

/** `orkeon-code run <crew> --settings … --workspace …` from a clone, `orkeon` on PATH by default. */
export function runStart(o: RunStart = {}): LaunchOptions {
  return {
    before: ["run", o.crew ?? "main-loop"], args: o.args ?? [], bin: o.bin ?? ORKEON, env: { ...ESBUILD, ...o.env },
    files: { ...CREWS, ...o.files }, install: o.install, trusted: o.trusted, systemPath: o.systemPath, settings: o.settings,
    checkoutInArgs: o.checkoutInArgs,
  };
}

/** The path of a crew of the launch's checkout, as the launcher resolves it. */
export const crewPath = (r: Run, rel = "src/crews/main-loop/crew.ork.ts") => join(realpathSync(r.root), rel);

/** What tool and source mode hand `orkeon run` after the program: the crew, the settings, the REPL's four mounts. */
export const runArgs = (r: Run, crew = crewPath(r)) => [
  "run", crew, "-s", join(r.root, "..", "settings.json"),
  "-m", `${r.project}:${WORKSPACE}:rw`, `${r.state}/output:/output:rw`, `${r.state}/tmp:/tmp:rw`, `${r.state}/user-config:/user-config:ro`,
  "--allow-external-mounts",
];

/** A file of the folder the launcher was started from (the scratch base), as the launcher names it absolute. */
export const callerFile = (r: Run, name: string) => join(realpathSync(join(r.root, "..")), name);

/** The clone's dotnet tool manifest (.config/dotnet-tools.json), naming the orkeon tool. */
export const TOOL_MANIFEST = { "checkout/.config/dotnet-tools.json": '{ "version": 1, "isRoot": true, "tools": {} }\n' };
export const DOTNET_BIN = { dotnet: DOTNET };
/** What the clone's dotnet tool runs, from the clone, after it restored the tool. */
export const cloneToolCalls = (r: Run) => [`${r.root} tool restore`, `${r.root} tool run orkeon ${runArgs(r).join(" ")}`];

export const SCRIPTING_CLI = "src/scripting/Orkeon.Scripting.Cli";
export const SCRIPTING_CLI_DLL = `${SCRIPTING_CLI}/bin/Debug/net10.0/orkeon.dll`;

/** An Orkeon checkout as source mode reads it for a run, its orkeon.dll already built. */
export function scriptingCheckout(): string {
  const source = scratchDir("orkeon-code-run-source-");
  mkdirSync(join(source, SCRIPTING_CLI_DLL, ".."), { recursive: true });
  writeFileSync(join(source, SCRIPTING_CLI_DLL), "");
  return source;
}

/** What source mode runs: the quiet build of the Scripting CLI in the checkout, then its assembly from the project. */
export const sourceCalls = (source: string, r: Run) => [
  `${source} build ${SCRIPTING_CLI} -c Debug --no-restore -nologo -v quiet`,
  `${r.project} ${join(source, SCRIPTING_CLI_DLL)} ${runArgs(r).join(" ")}`,
];

export const DOWNLOADED_ID = "abc1234";
export const DOWNLOADED_RAN = "own-orkeon";
/** An install's .orkeon-runtime naming the runtime DOWNLOADED_ID. */
export const NAMED_RUNTIME = { "checkout/.orkeon-runtime": `# test\nid=${DOWNLOADED_ID}\nurl=https://runtime.invalid\nlinux-x64=${"0".repeat(64)}\n` };

/** A home (ORKEON_CODE_HOME) that already holds the downloaded runtime, its bin/orkeon a recorder. */
export function homeWithOrkeon(): string {
  const home = scratchDir("orkeon-code-run-home-");
  const bin = join(home, "runtime", DOWNLOADED_ID, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "orkeon"), recorder(`echo ${DOWNLOADED_RAN} >> "$RECORD/calls"\n`));
  chmodSync(join(bin, "orkeon"), 0o755);
  return home;
}

/** An install whose package names a runtime, on a machine with no runner, the download agreed: curl serves the
 *  runtime archive, whose bin/orkeon records that it ran. */
export function downloadingRunStart(): LaunchOptions {
  const install = installStart({ env: AGREED });
  return runStart({ bin: install.bin, env: install.env, files: install.files, install: true, systemPath: install.systemPath });
}

/** An install whose package names no runtime, on a machine with neither orkeon, Docker nor ORKEON_SOURCE. */
export const noRunnerStart = (args: string[] = []) => runStart({ bin: {}, install: true, systemPath: pathWithoutRuntime(), args });

const FULL_ARCHIVE = "orkeon of the full archive of an Orkeon release (orkeon-<version>-<platform>) on PATH";
export const NO_RUNNER = ["no Orkeon runtime found to run a crew", FULL_ARCHIVE, "Docker or ORKEON_SOURCE"];
export const NO_ORKEON = ["orkeon not found: set ORKEON_CLI", FULL_ARCHIVE];

/** The words of a docker run that place the crew: the image, the runner, the crew as the container sees it. */
export const DOCKER_CREW = [IMAGE, "run", "/work/agent/src/crews/main-loop/crew.ork.ts"];
/** The checkout as the container's /work/agent, read-only: the crew's relative imports resolve there. */
export const agentMount = (r: Run) => `${r.root}:/work/agent:ro`;
/** A file of the checkout given after --, as the container names it. */
export const MOCK_IN_CONTAINER = ["--llm-mock", "/work/agent/tests/answers.jsonl"];
export const MOCK_ON_HOST = ["--mode", "docker", "--", "--llm-mock", "<checkout>/tests/answers.jsonl"];

/** Where `npm ci` leaves esbuild's binary in a clone, and no esbuild named in the environment. */
export const NPM_ESBUILD = "node_modules/@esbuild/linux-x64/bin/esbuild";
export const NPM_ESBUILD_FILE = { [`checkout/${NPM_ESBUILD}`]: "#!/bin/sh\n" };
export const NO_ESBUILD_NAMED = { ORKEON_ESBUILD_PATH: "" };
export const NO_ESBUILD = ["esbuild not found: run 'npm ci'"];
export const NO_SOURCE = ["ORKEON_SOURCE must name an Orkeon checkout (src/scripting/Orkeon.Scripting.Cli not found)"];

export const UNKNOWN = ["no crew 'nope'", "the crews: git-commit, main-loop"];
export const USAGE = ["usage: orkeon-code run <crew | path/to/crew.ork.ts>"];
export const NO_SESSION = ["a run is one turn, with no session"];
export const INPUTS_ARE_RUNS = ["--inputs belongs to 'orkeon-code run <crew>'"];
export const DOCKER_OUTSIDE_SRC = ["in docker mode the crew must lie under"];
export const INPUTS = '{"prompt":"list the files","permissionMode":"plan"}';
