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
/** The same, without the `--` before it, as scripts/smoke-crew.sh gives it. */
export const MOCK_ON_HOST_NO_DASHES = ["--mode", "docker", "--llm-mock", "<checkout>/tests/answers.jsonl"];
/** A file of the project given after --, relative from the caller's folder, and the name the container reads. */
export const PROJECT_MOCK = { "project/answers.jsonl": "{}\n" };
export const PROJECT_MOCK_ON_HOST = ["--mode", "docker", "--", "--llm-mock", "project/answers.jsonl"];
export const PROJECT_MOCK_IN_CONTAINER = ["--llm-mock", "/work/project/answers.jsonl"];
/** A file of the caller's folder, outside the project and the checkout: the container does not see it. */
export const CALLER_MOCK = { "answers.jsonl": "{}\n" };
export const CALLER_MOCK_IN_DOCKER = ["--mode", "docker", "--", "--llm-mock", "answers.jsonl"];
export const DOCKER_OUTSIDE_FILE = ["in docker mode the container sees only the project and the checkout", "put it under the project"];

/** The words given to `orkeon run` that the launcher leaves or makes absolute: only the value of a path option of
 *  `orkeon run` after --, in both spellings, is resolved from the caller's folder. */
export interface ResolvedCase { name: string; args: string[]; files: Record<string, string>; tail: (r: Run) => string[] }
export const RESOLVED_CASES: readonly ResolvedCase[] = [
  {
    name: "hands the value of --llm-mock=FILE after -- over absolute, as --llm-mock FILE",
    args: ["--", "--llm-mock=answers.jsonl"], files: CALLER_MOCK, tail: (r) => [`--llm-mock=${callerFile(r, "answers.jsonl")}`],
  },
  {
    name: "hands the value of --inputs-file after -- over absolute, a path option of orkeon run",
    args: ["--", "--inputs-file", "inputs.json"], files: { "inputs.json": "{}\n" }, tail: (r) => ["--inputs-file", callerFile(r, "inputs.json")],
  },
  {
    name: "passes the value of an option that takes no path as given, though it names a file of the caller's folder",
    args: ["--", "-v", "2"], files: { "2": "" }, tail: () => ["-v", "2"],
  },
  {
    name: "passes a word given before -- as given, though it names a file of the caller's folder",
    args: ["answers.jsonl"], files: CALLER_MOCK, tail: () => ["answers.jsonl"],
  },
];

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

/** A bridge token the runtime takes (16 characters or more), and one it refuses. */
export const BRIDGE_TOKEN = { ORKEON_BRIDGE_TOKEN: "0123456789abcdef0123" };
export const SHORT_BRIDGE_TOKEN = { ORKEON_BRIDGE_TOKEN: "0123456789abcde" };

/** Settings whose caller sends `firefox` to the tool bridge at `address`, under keys spelt as `keys` gives them. */
export function bridgeSettings(address: string, keys: readonly [string, string, string, string] = ["Orkeon", "Tools", "Bridge", "Address"]) {
  const [orkeon, tools, bridge, at] = keys;
  return { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" }, [orkeon]: { [tools]: { [bridge]: { [at]: address, Allow: ["firefox"] } } } };
}

/** The bridge addresses the launcher reads, and whether the container then joins the host's network. */
export const BRIDGE_CASES = [
  { name: "hands the token by name and joins the host's network for a bridge on 127.0.0.1", settings: bridgeSettings("http://127.0.0.1:7410/"), hostNetwork: true },
  { name: "joins the host's network for a bridge on localhost", settings: bridgeSettings("http://localhost:7410/"), hostNetwork: true },
  {
    name: "hands the token and stays off the host's network for Docker Desktop's host.docker.internal, keys read without case",
    settings: bridgeSettings("http://host.docker.internal:7410/", ["orkeon", "tools", "bridge", "address"]), hostNetwork: false,
  },
];
export const LOOPBACK_BRIDGE = bridgeSettings("http://127.0.0.1:7410/");
/** A bridge whose token lives in a variable of the user's choosing (Orkeon:Tools:Bridge:TokenEnvVar). */
export const NAMED_TOKEN_BRIDGE = {
  Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" },
  Orkeon: { Tools: { Bridge: { Address: "http://127.0.0.1:7410/", TokenEnvVar: "MY_BRIDGE_TOKEN", Allow: ["firefox"] } } },
};
export const NAMED_TOKEN = { MY_BRIDGE_TOKEN: "fedcba9876543210fedc" };
export const NAMED_TOKEN_UNSET = ["MY_BRIDGE_TOKEN is not set"];
export const NO_BRIDGE_TOKEN = ["names the tool bridge http://127.0.0.1:7410/", "ORKEON_BRIDGE_TOKEN is not set", "docs/tool-bridge.md"];
export const BRIDGE_TOKEN_TOO_SHORT = ["ORKEON_BRIDGE_TOKEN is shorter than 16 characters", "openssl rand -hex 32"];
