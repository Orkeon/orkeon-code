// The launchers. They turn the host's permission gate on in every mode: without it
// the session's rules (/permissions) and the modes are not enforced, and nothing
// asks before a call. Tool and source modes inherit the exported variable; docker
// mode passes it to the container. The unprefixed form sits under the settings
// file, so a settings file can still turn the gate off.
//
// The bash launcher runs here for real, from a copy of it in a scratch checkout
// (no node_modules, so no esbuild), with stand-ins for orkeon-repl, dotnet and
// docker on PATH that record their working directory, arguments and environment:
// how each mode starts the REPL on Orkeon rc.6. Its PowerShell twin is checked by
// reading it, and run the same way, on the same cases, where pwsh is installed
// (GitHub's ubuntu-latest has it). Run:
//   node --test tests/launcher.test.ts
import { after, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const read = (name: string) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf-8");
const GATE = "Orkeon__Security__PermissionGate__Enabled";

describe("the launchers enable the permission gate", () => {
  it("orkeon-code exports it, true unless the caller set it, and passes it to docker", () => {
    const script = read("orkeon-code");
    ok(script.includes(`export ${GATE}="\${${GATE}:-true}"`), "orkeon-code must export the gate setting");
    ok(script.includes(`-e "${GATE}=$${GATE}"`), "docker mode must pass the gate setting");
  });

  it("orkeon-code.ps1 sets it, true unless the caller set it, and passes it to docker", () => {
    const script = read("orkeon-code.ps1");
    ok(script.includes(`if (-not $env:${GATE}) { $env:${GATE} = 'true' }`), "orkeon-code.ps1 must set the gate setting");
    ok(script.includes(`'-e', "${GATE}=$env:${GATE}"`), "docker mode must pass the gate setting");
  });

  it("the example settings turn it on", () => {
    for (const file of ["config/appsettings.example.json", "config/appsettings.ollama.example.json", "config/appsettings.ollama-whisper.example.json"]) {
      const settings = JSON.parse(read(file));
      strictEqual(settings.Orkeon.Security.PermissionGate.Enabled, true, file);
    }
  });
});

// ── The bash launcher, run ──────────────────────────────────────────────────

const scratch: string[] = [];
after(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

/** A stand-in that records how it was started, then exits 0. `extra` goes before the recording. */
function recorder(extra = ""): string {
  return `#!/bin/sh\n${extra}pwd > "$RECORD/cwd"\nprintf '%s\\n' "$@" > "$RECORD/args"\nenv > "$RECORD/env"\n`;
}

/** The Debian package's /usr/bin/orkeon-repl, as scripts/package-deb.sh writes it, recording instead of exec. */
const DEB_WRAPPER = recorder(
  'ORKEON_HOME=/usr/lib/orkeon\nif [ -z "${ORKEON_ESBUILD_PATH:-}" ] && [ -x "$ORKEON_HOME/esbuild-bin/esbuild" ]; then\n' +
    '  ORKEON_ESBUILD_PATH="$ORKEON_HOME/esbuild-bin/esbuild"\n  export ORKEON_ESBUILD_PATH\nfi\n',
);

/** dotnet: every call lands in `calls` as `<cwd> <args>`; a build succeeds unless DOTNET_BUILD_FAILS is set, and
 *  any other call (the REPL's assembly) is recorded like the other stand-ins. */
const DOTNET = recorder(
  'echo "$(pwd) $*" >> "$RECORD/calls"\n' +
    'if [ "$1" = build ]; then if [ -n "${DOTNET_BUILD_FAILS:-}" ]; then exit 1; fi; exit 0; fi\n',
);

/** Where a source-mode build leaves the REPL, under the Orkeon checkout. */
const CONSOLE_APP_DLL = "src/apps/Orkeon.ConsoleApp/bin/Debug/net10.0/Orkeon.ConsoleApp.dll";

function scratchDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  scratch.push(dir);
  return dir;
}

/** An Orkeon checkout as the source mode reads it, its REPL already built. */
function orkeonCheckout(): string {
  const source = scratchDir("orkeon-code-source-");
  mkdirSync(join(source, CONSOLE_APP_DLL, ".."), { recursive: true });
  writeFileSync(join(source, CONSOLE_APP_DLL), "");
  return source;
}

interface Run {
  status: number | null; stdout: string; stderr: string; cwd: string; args: string[]; env: Map<string, string>; calls: string[];
  root: string; project: string; state: string;
}

/** pwsh, when installed: the PowerShell twin is then run as well. */
const PWSH = spawnSync("sh", ["-c", "command -v pwsh"], { encoding: "utf-8" }).stdout.trim();

/** Runs a copy of ./orkeon-code (or of ./orkeon-code.ps1, `shell: "pwsh"`, whose `args` are its own) with the given
 *  stand-ins on PATH, on a project holding `projectFiles`. */
function launch(opts: {
  args: string[]; bin: Record<string, string>; env?: Record<string, string>; projectFiles?: Record<string, string>;
  settings?: Record<string, unknown>; shell?: "bash" | "pwsh";
  /** An install (no `.git` beside the launcher) rather than a clone (the default). */
  install?: boolean;
  /** No --settings, --workspace nor ORKEON_CODE_STATE: the launcher's own defaults apply, from the project. */
  bare?: boolean;
  /** More files, by path under the scratch folder (beside `bin/`, `checkout/`, `project/`). */
  files?: Record<string, string>;
  /** false: the scratch folder is not in the trust store (by default it is, so the start is silent). */
  trusted?: boolean;
  /** Runs the launcher on a pseudo-terminal (`script`), these lines typed on it. */
  tty?: string;
}): Run {
  const base = scratchDir("orkeon-code-launcher-");
  const root = join(base, "checkout");
  const bin = join(base, "bin");
  const project = join(base, "project");
  const state = join(base, "state");
  const record = join(base, "record");
  for (const dir of [root, bin, project, record, join(root, "scripts")]) mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(opts.projectFiles ?? {})) writeFileSync(join(project, name), content);
  for (const file of ["orkeon-code", "orkeon-code.ps1", ".orkeon-version", "package.json", "scripts/setup-fixture.sh"]) {
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(root, file));
  }
  if (!opts.install) mkdirSync(join(root, ".git"));
  for (const [name, content] of Object.entries(opts.files ?? {})) {
    mkdirSync(join(base, name, ".."), { recursive: true });
    writeFileSync(join(base, name), content);
  }
  if (opts.trusted !== false) {
    const codeHome = opts.env?.ORKEON_CODE_HOME ?? join(base, ".orkeon-code");
    mkdirSync(codeHome, { recursive: true });
    writeFileSync(join(codeHome, "trusted-folders.json"), trustStore([base]));
  }
  const settings = join(base, "settings.json");
  writeFileSync(settings, JSON.stringify(opts.settings ?? { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" } }));
  for (const [name, body] of Object.entries(opts.bin)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const given = opts.bare ? []
    : opts.shell === "pwsh" ? ["-Settings", settings, "-Workspace", project] : ["--settings", settings, "--workspace", project];
  const [command, args] = opts.shell === "pwsh"
    ? [PWSH, ["-NoProfile", "-File", join(root, "orkeon-code.ps1"), ...given, ...opts.args]]
    : ["bash", [join(root, "orkeon-code"), ...given, ...opts.args]];
  const [file, argv] = opts.tty === undefined ? [command, args] : ["script", ["-qec", [command, ...args].map(shq).join(" "), "/dev/null"]];
  const run = spawnSync(file, argv, {
    cwd: opts.bare ? project : base,
    encoding: "utf-8",
    input: opts.tty,
    env: {
      PATH: `${bin}:/usr/bin:/bin`, HOME: base, ...(opts.bare ? {} : { ORKEON_CODE_STATE: state }), RECORD: record, ...opts.env,
    },
  });
  const recorded = (name: string) => { try { return readFileSync(join(record, name), "utf-8"); } catch { return ""; } };
  const env = new Map(recorded("env").split("\n").filter((l) => l.includes("=")).map((l) => {
    const eq = l.indexOf("=");
    return [l.slice(0, eq), l.slice(eq + 1)] as [string, string];
  }));
  return {
    status: run.status, stdout: run.stdout, stderr: run.stderr, cwd: recorded("cwd").trim(),
    args: recorded("args").split("\n").slice(0, -1), env, calls: recorded("calls").split("\n").slice(0, -1),
    root, project, state,
  };
}

/** A word for sh -c, quoted. */
const shq = (word: string) => `'${word.replace(/'/g, "'\\''")}'`;

/** A trust store in the launchers' layout, every folder trusted on the same date. */
function trustStore(folders: string[]): string {
  const lines = folders.map((f) => `    { "path": ${JSON.stringify(f)}, "trustedAt": "2026-10-24T00:00:00Z" }`);
  return `{\n  "version": 1,\n  "folders": [\n${lines.join(",\n")}\n  ]\n}\n`;
}

/** The virtual roots of the --mount arguments. */
const mountRoots = (args: string[]) =>
  args.flatMap((a, i) => (args[i - 1] === "--mount" ? [a.split(":")[1]] : []));

const RESERVED = /^\/(sandbox|credentials|cli-commands|crews)/;

describe("orkeon-code, tool and source modes on Orkeon rc.6", () => {
  it("tool mode starts the REPL from the project, external mounts allowed, four distinct roots", () => {
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    strictEqual(r.env.get("ORKEON_ALLOW_EXTERNAL_MOUNTS"), "1");
    deepStrictEqual(r.args, [
      "--runner=scripted-commands", "--commands-dir", join(r.root, "src/commands"), "--crews-dir", join(r.root, "src/crews"),
      "--settings", join(r.root, "..", "settings.json"),
      "--mount", `${r.project}:/workspace:rw`, "--mount", `${r.state}/output:/output:rw`, "--mount", `${r.state}/tmp:/tmp:rw`,
      "--mount", `${r.state}/user-config:/user-config:ro`,
    ]);
    const roots = mountRoots(r.args);
    strictEqual(new Set(roots).size, roots.length, "no root mounted twice");
    ok(!roots.some((root) => RESERVED.test(root)), roots.join(", "));
  });

  it("source mode builds in the Orkeon checkout, then runs the assembly from the project", () => {
    const r = launch({ args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 1, "no ORKEON_SOURCE: refused");
    ok(r.stderr.includes("ORKEON_SOURCE must name an Orkeon checkout"), r.stderr);
    const source = orkeonCheckout();
    // The project pins an SDK the machine may not have: no SDK command may run there.
    const s = launch({
      args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_SOURCE: source },
      projectFiles: { "global.json": JSON.stringify({ sdk: { version: "8.0.100", rollForward: "disable" } }) },
    });
    strictEqual(s.status, 0, s.stderr);
    deepStrictEqual(s.calls, [
      `${source} build src/apps/Orkeon.ConsoleApp -c Debug --no-restore -nologo -v quiet`,
      `${s.project} ${join(source, CONSOLE_APP_DLL)} ${s.args.slice(1).join(" ")}`,
    ]);
    strictEqual(s.cwd, s.project);
    strictEqual(s.env.get("ORKEON_ALLOW_EXTERNAL_MOUNTS"), "1");
    deepStrictEqual(s.args.slice(0, 2), [join(source, CONSOLE_APP_DLL), "--runner=scripted-commands"]);
  });

  it("source mode stops when the build fails, and starts nothing", () => {
    const r = launch({
      args: ["--mode", "source"], bin: { dotnet: DOTNET },
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_SOURCE: orkeonCheckout(), DOTNET_BUILD_FAILS: "1" },
    });
    strictEqual(r.status, 1);
    ok(r.stderr.includes("building src/apps/Orkeon.ConsoleApp in"), r.stderr);
    deepStrictEqual(r.calls.length, 1, "only the build ran");
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("leaves MaxScripts to Orkeon's default and keeps the gate on", () => {
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.env.has("Orkeon__Cli__ScriptCommands__MaxScripts"), false);
    strictEqual(r.env.get(GATE), "true");
  });
});

describe("orkeon-code, esbuild in tool mode", () => {
  it("trusts the Debian package's orkeon-repl, which points the runtime at its own esbuild", () => {
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": DEB_WRAPPER } });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.has("ORKEON_ESBUILD_PATH"), false, "the launcher leaves it to the wrapper");
  });

  it("passes an ORKEON_ESBUILD_PATH already set as is", () => {
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.get("ORKEON_ESBUILD_PATH"), "/opt/esbuild");
  });

  it("uses an esbuild on PATH, and stops when there is none anywhere", () => {
    const withPath = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder(), esbuild: "#!/bin/sh\n" } });
    strictEqual(withPath.status, 0, withPath.stderr);
    const none = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() } });
    strictEqual(none.status, 1);
    ok(none.stderr.includes("esbuild not found: run 'npm ci'"), none.stderr);
  });
});

describe("orkeon-code, docker mode", () => {
  it("runs the image of .orkeon-version, multi-arch: no platform forced, no MaxScripts", () => {
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() } });
    strictEqual(r.status, 0, r.stderr);
    const version = read(".orkeon-version").trim();
    ok(r.args.includes(`ghcr.io/orkeon/orkeon-runners:${version}`), r.args.join(" "));
    ok(!r.args.some((a) => a.startsWith("--platform")), r.args.join(" "));
    ok(!r.args.some((a) => a.includes("MaxScripts")), r.args.join(" "));
    ok(r.args.includes(`${GATE}=true`), r.args.join(" "));
    const roots = mountRoots(r.args);
    deepStrictEqual(roots, ["/workspace", "/output", "/tmp", "/user-config"]);
  });
});

describe("orkeon-code, speech-to-text (ORKEON_CODE_AUDIO_DIR)", () => {
  const TOOL = { "orkeon-repl": recorder(), uv: "#!/bin/sh\n" };
  const WHISPER = "ORKEON_MCP__Servers__whisper__";
  const whisperEnv = (r: Run) => [...r.env.keys()].filter((k) => k.startsWith(WHISPER) || k.startsWith("WHISPER_")).sort();

  it("mounts the folder on /audio and the transcripts on /transcripts, read-only, and declares the server", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const r = launch({ args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio } });
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(r.args.slice(-4), ["--mount", `${audio}:/audio:ro`, "--mount", `${r.state}/transcripts:/transcripts:ro`]);
    const roots = mountRoots(r.args);
    deepStrictEqual(roots, ["/workspace", "/output", "/tmp", "/user-config", "/audio", "/transcripts"]);
    ok(!roots.some((root) => RESERVED.test(root)), roots.join(", "));
    strictEqual(r.env.get("WHISPER_AUDIO_DIR"), audio);
    strictEqual(r.env.get("WHISPER_OUT_DIR"), `${r.state}/transcripts`);
    strictEqual(r.env.get(`${WHISPER}Transport`), "Stdio");
    ok(r.env.get(`${WHISPER}Command`)!.endsWith("/bin/uv"), r.env.get(`${WHISPER}Command`));
    deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map((i) => r.env.get(`${WHISPER}Args__${i}`)),
      ["run", "--project", join(r.root, "mcp/whisper"), "--extra", "tts", join(r.root, "mcp/whisper/whisper_mcp.py"), undefined],
      "Piper, the default speech backend, writes what it would say without the speaker too");
    ok(r.stdout.includes(`  audio    : ${audio} -> /audio`), r.stdout);
    ok(statSync(join(r.state, "transcripts")).isDirectory(), "the transcripts folder exists before the server starts");
  });

  it("opens the microphone and the speaker only with ORKEON_CODE_VOICE=1: the voice extra, WHISPER_MICROPHONE and WHISPER_SPEAKER", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const off = launch({ args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio } });
    strictEqual(off.env.has("WHISPER_MICROPHONE"), false);
    strictEqual(off.env.has("WHISPER_SPEAKER"), false);
    ok(![...off.env.values()].includes("voice"), "no voice extra");
    const on = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1" },
    });
    strictEqual(on.status, 0, on.stderr);
    strictEqual(on.env.get("WHISPER_MICROPHONE"), "1");
    strictEqual(on.env.get("WHISPER_SPEAKER"), "1");
    deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => on.env.get(`${WHISPER}Args__${i}`)),
      ["run", "--project", join(on.root, "mcp/whisper"), "--extra", "voice", "--extra", "tts", join(on.root, "mcp/whisper/whisper_mcp.py")]);
    ok(on.stdout.includes(", microphone and speaker on)"), on.stdout);
    const http = launch({
      args: ["--mode", "tool"], bin: TOOL,
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1", TTS_BACKEND: "http" },
    });
    deepStrictEqual([3, 4, 5, 6, 7].map((i) => http.env.get(`${WHISPER}Args__${i}`)),
      ["--extra", "voice", "--extra", "openai", join(http.root, "mcp/whisper/whisper_mcp.py")], "the openai extra, no tts, for another backend");
  });

  it("adds the cuda extra on WHISPER_DEVICE=cuda, after the voice extra", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const r = launch({
      args: ["--mode", "tool"], bin: TOOL,
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1", WHISPER_DEVICE: "cuda" },
    });
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => r.env.get(`${WHISPER}Args__${i}`)), [
      "run", "--project", join(r.root, "mcp/whisper"), "--extra", "voice", "--extra", "tts", "--extra", "cuda",
      join(r.root, "mcp/whisper/whisper_mcp.py"),
    ]);
    ok(r.stdout.includes(" on the GPU, microphone and speaker on)"), r.stdout);
  });

  it("adds the openai extra once when transcription or speech goes through OpenAI's API or a compatible server", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const both = launch({
      args: ["--mode", "tool"], bin: TOOL,
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, WHISPER_BACKEND: "openai", TTS_BACKEND: "http" },
    });
    strictEqual(both.status, 0, both.stderr);
    deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map((i) => both.env.get(`${WHISPER}Args__${i}`)),
      ["run", "--project", join(both.root, "mcp/whisper"), "--extra", "openai", join(both.root, "mcp/whisper/whisper_mcp.py"), undefined]);
  });

  it("reads the backends and the device as the server does, case and spaces aside", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const r = launch({
      args: ["--mode", "tool"], bin: TOOL,
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, TTS_BACKEND: " OpenAI", WHISPER_DEVICE: "CUDA" },
    });
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual([3, 4, 5, 6, 7].map((i) => r.env.get(`${WHISPER}Args__${i}`)),
      ["--extra", "openai", "--extra", "cuda", join(r.root, "mcp/whisper/whisper_mcp.py")]);
    const openai = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, WHISPER_BACKEND: "openai" },
    });
    ok(openai.stdout.includes(", model whisper-1)"), openai.stdout);
  });

  it("changes nothing when the variable is not set", () => {
    const r = launch({ args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(whisperEnv(r), []);
    deepStrictEqual(mountRoots(r.args), ["/workspace", "/output", "/tmp", "/user-config"]);
    ok(!r.stdout.includes("audio"), r.stdout);
  });

  it("starts without the server, and says why, when uv is missing or a settings file declares one", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const noUv = launch({
      args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio },
    });
    strictEqual(noUv.status, 0, noUv.stderr);
    ok(noUv.stderr.includes("uv is not on PATH: speech-to-text is off"), noUv.stderr);
    deepStrictEqual([whisperEnv(noUv), mountRoots(noUv.args)], [[], ["/workspace", "/output", "/tmp", "/user-config"]]);
    const declared = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio },
      settings: { Llm: { Model: "m" }, MCP: { Servers: { whisper: { Command: "/opt/uv" } } } },
    });
    strictEqual(declared.status, 0, declared.stderr);
    ok(declared.stderr.includes('declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored'), declared.stderr);
    deepStrictEqual([whisperEnv(declared), mountRoots(declared.args)], [[], ["/workspace", "/output", "/tmp", "/user-config"]]);
    const anyCase = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio },
      settings: { Llm: { Model: "m" }, MCP: { Servers: { Whisper: { Command: "/opt/uv" } } } },
    });
    ok(anyCase.stderr.includes('declares a "whisper" MCP server'), "the runtime reads the name case aside: " + anyCase.stderr);
    deepStrictEqual(whisperEnv(anyCase), []);
    const inEnv = launch({
      args: ["--mode", "tool"], bin: TOOL,
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, [`${WHISPER}Url`]: "http://host.docker.internal:8765/mcp" },
    });
    strictEqual(inEnv.status, 0, inEnv.stderr);
    ok(inEnv.stderr.includes('the environment declares a "whisper" MCP server (ORKEON_MCP__Servers__whisper__*)'), inEnv.stderr);
    deepStrictEqual([whisperEnv(inEnv), mountRoots(inEnv.args)], [[`${WHISPER}Url`], ["/workspace", "/output", "/tmp", "/user-config"]], "left as it was");
  });

  it("stops on a folder that does not exist", () => {
    const r = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: "/nonexistent/audio" },
    });
    strictEqual(r.status, 1);
    ok(r.stderr.includes("ORKEON_CODE_AUDIO_DIR=/nonexistent/audio is not a folder."), r.stderr);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("is ignored in docker mode, where a Stdio server would run inside the container", () => {
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder(), uv: "#!/bin/sh\n" }, env: { ORKEON_CODE_AUDIO_DIR: scratchDir("orkeon-code-audio-") } });
    strictEqual(r.status, 0, r.stderr);
    ok(r.stderr.includes("ORKEON_CODE_AUDIO_DIR is ignored in docker mode"), r.stderr);
    ok(!r.args.some((a) => a.includes("/audio") || a.includes("whisper")), r.args.join(" "));
  });
});

// ── The user settings (LI-6) ────────────────────────────────────────────────
// The scripts read no settings and no environment (V-04): the launcher hands them the orkeonCode block of the
// settings file as <state>/user-config/config.json, mounted read-only on /user-config, in every mode.

describe("orkeon-code, the user settings on /user-config", () => {
  // node reads the block: a stand-in on PATH that runs this test's node, wherever it is installed.
  const NODE = { node: `#!/bin/sh\nexec "${process.execPath}" "$@"\n` };
  const BLOCK = { "permissions.fallback": "acceptEdits", "tools.extra": "search_issues:read" };
  const SETTINGS = { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1", ApiKey: "never-copied" }, orkeonCode: BLOCK };
  const userFile = (r: Run) => join(r.state, "user-config", "config.json");
  const launchWithNode = (o: Parameters<typeof launch>[0]) => launch({ ...o, bin: { ...o.bin, ...NODE } });

  for (const mode of ["tool", "source", "docker"] as const) {
    it(`${mode} mode mounts the folder read-only and the file holds the orkeonCode block alone`, () => {
      const env: Record<string, string> = { ORKEON_ESBUILD_PATH: "/opt/esbuild" };
      if (mode === "source") env.ORKEON_SOURCE = orkeonCheckout();
      const bin: Record<string, string> = { tool: { "orkeon-repl": recorder() }, source: { dotnet: DOTNET }, docker: { docker: recorder() } }[mode];
      const r = launchWithNode({ args: ["--mode", mode], bin, env, settings: SETTINGS });
      strictEqual(r.status, 0, r.stderr);
      const host = mode === "docker" ? "/work/state/user-config" : `${r.state}/user-config`;
      ok(r.args.join("\n").includes(`--mount\n${host}:/user-config:ro`), r.args.join(" "));
      const text = readFileSync(userFile(r), "utf-8");
      deepStrictEqual(JSON.parse(text), BLOCK);
      ok(!text.includes("Llm") && !text.includes("never-copied"), text);
    });
  }

  it("writes an empty block as it is, and no file for a block that is not an object or a key of another case", () => {
    const tool = { "orkeon-repl": recorder() };
    const env = { ORKEON_ESBUILD_PATH: "/opt/esbuild" };
    const empty = launchWithNode({ args: ["--mode", "tool"], bin: tool, env, settings: { ...SETTINGS, orkeonCode: {} } });
    strictEqual(empty.status, 0, empty.stderr);
    deepStrictEqual(JSON.parse(readFileSync(userFile(empty), "utf-8")), {});
    for (const settings of [{ ...SETTINGS, orkeonCode: [BLOCK] }, { Llm: SETTINGS.Llm, OrkeonCode: BLOCK }]) {
      const r = launchWithNode({ args: ["--mode", "tool"], bin: tool, env, settings });
      strictEqual(r.status, 0, r.stderr);
      ok(!existsSync(userFile(r)), JSON.stringify(settings));
    }
  });

  it("warns, and still starts, when the settings file cannot be parsed", () => {
    const r = launchWithNode({
      args: ["--mode", "tool", "--settings", "broken.json"], bin: { "orkeon-repl": recorder() },
      env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" }, files: { "broken.json": '{ "Llm": {}, "orkeonCode": ' },
    });
    strictEqual(r.status, 0, r.stderr);
    ok(r.stderr.includes("the orkeonCode block of") && r.stderr.includes("could not be read: no user setting applies."), r.stderr);
    ok(!existsSync(userFile(r)));
  });

  it("leaves the folder empty, and still mounts it, when the settings have no block", () => {
    const tool = { "orkeon-repl": recorder() };
    const none = launchWithNode({ args: ["--mode", "tool"], bin: tool, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(none.status, 0, none.stderr);
    ok(!existsSync(userFile(none)), "no block, no file");
    strictEqual(none.stderr.includes("orkeonCode"), false, none.stderr);
    ok(mountRoots(none.args).includes("/user-config"), none.args.join(" "));
    // A file from an earlier start never outlives a block taken out of the settings.
    mkdirSync(join(none.state, "user-config"), { recursive: true });
    writeFileSync(userFile(none), JSON.stringify(BLOCK));
    const again = launchWithNode({ args: ["--mode", "tool"], bin: tool, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_STATE: none.state } });
    strictEqual(again.status, 0, again.stderr);
    ok(!existsSync(userFile(none)), "the stale file is gone");
  });
});

// ── A clone or an install ───────────────────────────────────────────────────
// A `.git` beside the launcher is a clone: today's behaviour. Without it the launcher runs from an install (an
// archive under ~/.local/lib/orkeon-code, or an npm prefix), whose folder it never writes to: its state, and the
// demo repository, go under ORKEON_CODE_HOME (~/.orkeon-code).

const CODE_VERSION = JSON.parse(read("package.json")).version as string;
const RUNTIME_VERSION = read(".orkeon-version").trim();
const SETTINGS_TEXT = JSON.stringify({ Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" } });
/** The user's settings file the launchers read today, under the scratch HOME. */
const USER_SETTINGS = { ".config/orkeon-code/appsettings.json": SETTINGS_TEXT };
const TOOL_REPL = { "orkeon-repl": recorder() };
const ESBUILD = { ORKEON_ESBUILD_PATH: "/opt/esbuild" };
const mountOf = (r: Run, root: string) => r.args.find((a, i) => r.args[i - 1] === "--mount" && a.endsWith(`:${root}:rw`));

describe("orkeon-code, a clone or an install", () => {
  it("--version names Code's version, where it runs from and the Orkeon expected, with nothing configured", () => {
    const clone = launch({ args: ["--version"], bin: {}, bare: true });
    strictEqual(clone.status, 0, clone.stderr);
    const [first, second] = clone.stdout.split("\n");
    strictEqual(first, `orkeon-code ${CODE_VERSION} (clone: ${clone.root})`);
    ok(second.startsWith(`Orkeon ${RUNTIME_VERSION} expected, found: `), second);
    const install = launch({ args: ["--version"], bin: {}, bare: true, install: true });
    strictEqual(install.status, 0, install.stderr);
    strictEqual(install.stdout.split("\n")[0], `orkeon-code ${CODE_VERSION} (install: ${install.root})`);
    // An unpacked source archive has no .git, but its tests: a clone still.
    const source = launch({ args: ["--version"], bin: {}, bare: true, install: true, files: { "checkout/tests/a.test.ts": "" } });
    strictEqual(source.stdout.split("\n")[0], `orkeon-code ${CODE_VERSION} (clone: ${source.root})`);
  });

  it("--version reads the version of an Orkeon archive install beside orkeon-repl, and never starts the REPL", () => {
    const r = launch({ args: ["--version"], bin: TOOL_REPL, bare: true, files: { VERSION: "1.0.0-rc.6\n" } });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.stdout.split("\n")[1], `Orkeon ${RUNTIME_VERSION} expected, found: 1.0.0-rc.6 (orkeon-repl, ${join(r.root, "..", "VERSION")})`);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("a clone keeps its state in .crew-output and reads config/appsettings.local.json first", () => {
    const r = launch({
      args: ["--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true,
      files: { "checkout/config/appsettings.local.json": SETTINGS_TEXT },
    });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(mountOf(r, "/output"), `${join(r.root, ".crew-output")}/output:/output:rw`);
    ok(r.args.includes(join(r.root, "config/appsettings.local.json")), r.args.join(" "));
    strictEqual(r.cwd, r.project);
  });

  it("an install keeps its state under ~/.orkeon-code, or ORKEON_CODE_HOME, never beside the launcher", () => {
    const r = launch({ args: ["--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, install: true, files: USER_SETTINGS });
    strictEqual(r.status, 0, r.stderr);
    const home = join(r.root, "..", ".orkeon-code");
    strictEqual(mountOf(r, "/output"), `${home}/state/output:/output:rw`);
    strictEqual(mountOf(r, "/tmp"), `${home}/state/tmp:/tmp:rw`);
    ok(!existsSync(join(r.root, ".crew-output")), "nothing written beside the launcher");
    const other = scratchDir("orkeon-code-home-");
    const h = launch({
      args: ["--mode", "tool"], bin: TOOL_REPL, env: { ...ESBUILD, ORKEON_CODE_HOME: other }, bare: true, install: true, files: USER_SETTINGS,
    });
    strictEqual(h.status, 0, h.stderr);
    strictEqual(mountOf(h, "/output"), `${other}/state/output:/output:rw`);
  });

  it("an install never reads a config/appsettings.local.json beside it, and says where the settings go", () => {
    const r = launch({
      args: ["--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, install: true,
      files: { "checkout/config/appsettings.local.json": SETTINGS_TEXT },
    });
    strictEqual(r.status, 1);
    ok(r.stderr.includes("no settings file. Run 'orkeon-code setup' in a terminal"), r.stderr);
    ok(r.stderr.includes(join(r.root, "..", ".orkeon-code/appsettings.json")), r.stderr);
    ok(r.stderr.includes(join(r.root, "config/appsettings.example.json")), r.stderr);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("--demo seeds the sample repository under the checkout for a clone, under ~/.orkeon-code/demo for an install", () => {
    const clone = launch({ args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, files: USER_SETTINGS });
    strictEqual(clone.status, 0, clone.stderr);
    strictEqual(clone.cwd, join(clone.root, "fixtures/sample-repo"));
    const install = launch({
      args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, install: true, files: USER_SETTINGS,
    });
    strictEqual(install.status, 0, install.stderr);
    strictEqual(install.cwd, join(install.root, "..", ".orkeon-code/demo/sample-repo"));
    ok(existsSync(join(install.cwd, ".git")), "the demo repository has its history");
    ok(!existsSync(join(install.root, "fixtures")), "nothing written beside the launcher");
  });

  it("an install without esbuild names the Orkeon package or archive, not npm ci", () => {
    const r = launch({ args: ["--mode", "tool"], bin: TOOL_REPL, install: true });
    strictEqual(r.status, 1);
    ok(r.stderr.includes("esbuild not found: install Orkeon from its package or archive"), r.stderr);
    ok(!r.stderr.includes("npm ci"), r.stderr);
  });
});

describe("orkeon-code.ps1 follows the same rules (read here; run below, where pwsh is installed)", () => {
  const script = read("orkeon-code.ps1");

  it("tells a clone from an install, and keeps an install's state under ORKEON_CODE_HOME", () => {
    ok(script.includes("$IsClone = Test-Path (Join-Path $Root '.git')"), "a .git beside the launcher is a clone");
    ok(script.includes("$CodeHome = if ($env:ORKEON_CODE_HOME) { $env:ORKEON_CODE_HOME } else { Join-Path $HOME '.orkeon-code' }"),
      "ORKEON_CODE_HOME, else ~/.orkeon-code");
    ok(script.includes("Join-Path $CodeHome 'state'"), "an install's state");
    ok(script.includes("install Orkeon from its package or archive"), "the install's esbuild message");
  });

  it("prints the same --version lines before reading any settings", () => {
    ok(script.includes("orkeon-code $codeVersion ($kind`: $Root)"), "the first line");
    ok(script.includes("Orkeon $OrkeonVersion expected, found: $found"), "the second line");
    ok(script.indexOf("if ($Version") < script.indexOf("$Settings = (Resolve-Path $Settings).Path"), "before the settings");
  });

  it("runs the REPL from the project with external mounts allowed, no common parent", () => {
    ok(script.includes("$env:ORKEON_ALLOW_EXTERNAL_MOUNTS = '1'"), "orkeon-code.ps1 must allow external mounts");
    ok(script.includes("Push-Location $Workspace"), "orkeon-code.ps1 must start the REPL from the project");
    ok(!script.includes("$common"), "the GAP-49 common-parent workaround is gone");
  });

  it("leaves MaxScripts to Orkeon's default and forces no platform", () => {
    ok(!script.includes("MaxScripts"), "orkeon-code.ps1 must not set MaxScripts");
    ok(!script.includes("--platform"), "orkeon-code.ps1 must not force a platform");
  });

  it("trusts a launcher script that sets ORKEON_ESBUILD_PATH (the Debian package's)", () => {
    ok(script.includes("-Pattern 'ORKEON_ESBUILD_PATH' -SimpleMatch -Quiet"), "orkeon-code.ps1 must detect the wrapper");
  });

  it("turns speech-to-text on as ./orkeon-code does: two read-only mounts, the server declared, ignored in docker", () => {
    ok(script.includes(`$audioArgs = @('--mount', "\${audio}:/audio:ro", '--mount', "\${transcripts}:/transcripts:ro")`), "the two mounts");
    ok(script.includes("& $exe @rest @replArgs @audioArgs @Extra"), "the mounts reach the REPL");
    ok(script.includes("$env:ORKEON_MCP__Servers__whisper__Command = $uv.Source"), "uv started by its full path");
    ok(script.includes("ORKEON_CODE_AUDIO_DIR is ignored in docker mode"), "docker mode leaves it aside");
    ok(script.includes(`$settingsText -match '"whisper"\\s*:'`), "a settings file that declares the server wins");
    ok(script.includes("$_.Name -like 'ORKEON_MCP__Servers__whisper__*'"), "a server declared in the environment wins too");
    ok(script.includes("if ($env:ORKEON_CODE_VOICE -eq '1') {") && script.includes("$env:WHISPER_MICROPHONE = '1'")
      && script.includes("$env:WHISPER_SPEAKER = '1'"), "the microphone and the speaker on ORKEON_CODE_VOICE=1 only");
  });

  it("hands the user settings over as ./orkeon-code does: the orkeonCode block alone, read-only on /user-config", () => {
    ok(script.includes(`'--mount', "\${userConfig}:/user-config:ro"`), "the read-only mount");
    ok(script.includes("Where-Object { $_.Name -ceq 'orkeonCode' }"), "the block alone, its key case for case");
    ok(script.includes("Get-Content $Settings -Raw -Encoding UTF8"), "read as UTF-8 by Windows PowerShell 5.1 too");
    ok(script.includes("Remove-Item $userConfigFile"), "written afresh at each start");
    ok(script.includes("'/work/state/user-config'") && script.includes("(Join-Path $State 'tmp') $userConfigDir"), "every mode");
  });

  it("keeps a one-word ORKEON_REPL argument an array (an if statement would unroll it into characters)", () => {
    ok(script.includes("$rest = @($repl | Select-Object -Skip 1)"), "orkeon-code.ps1 must build $rest as an array");
  });

  it("puts back every variable it sets, so none stays in the calling session", () => {
    const set = [...new Set([...script.matchAll(/\$env:(\w+)\s*=(?!=)/g)].map((m) => m[1]))].sort();
    deepStrictEqual(set, ["ORKEON_ALLOW_EXTERNAL_MOUNTS", "ORKEON_ESBUILD_PATH", "ORKEON_Llm__Model", GATE,
      "WHISPER_AUDIO_DIR", "WHISPER_OUT_DIR", "WHISPER_MICROPHONE", "WHISPER_SPEAKER", "ORKEON_MCP__Servers__whisper__Transport",
      "ORKEON_MCP__Servers__whisper__Command", "UV_PROJECT_ENVIRONMENT"].sort());
    // The server's arguments are set in a loop, by name: Args__0 to Args__11 at most (run, --project, the folder,
    // --frozen for an install, --extra voice, --extra tts, --extra openai, --extra cuda, the script).
    ok(script.includes('[Environment]::SetEnvironmentVariable("ORKEON_MCP__Servers__whisper__Args__$i", $whisperArgs[$i])'), "the loop");
    const args = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `ORKEON_MCP__Servers__whisper__Args__${i}`);
    const saved = /foreach \(\$name in @\(([^)]*)\)\) \{\s*\$savedEnv\[\$name\] = \[Environment\]::GetEnvironmentVariable\(\$name\)/
      .exec(script);
    ok(saved !== null, "orkeon-code.ps1 must save the variables before it sets them");
    deepStrictEqual([...saved![1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(), [...set, ...args].sort());
    ok(script.indexOf("$savedEnv[$name] =") < script.indexOf("$env:ORKEON_Llm__Model ="), "saved before the first is set");
    ok(/\} finally \{(\s*#[^\n]*\n)*\s*foreach \(\$name in \$savedEnv\.Keys\) \{\s*if \(\$null -eq \$savedEnv\[\$name\]\) \{ Remove-Item "env:\$name"[^}]*\}\s*else \{ \[Environment\]::SetEnvironmentVariable\(\$name, \$savedEnv\[\$name\]\) \}\s*\}\s*\}\s*$/
      .test(script), "orkeon-code.ps1 must restore them in a finally that closes the script, removing those that were not set");
  });
});

describe("orkeon-code.ps1, run where pwsh is installed", { skip: PWSH ? false : "pwsh is not on PATH" }, () => {
  const TOOL = { "orkeon-repl": recorder(), uv: "#!/bin/sh\n" };
  const WHISPER = "ORKEON_MCP__Servers__whisper__";
  /** What the REPL gets of the server: its arguments, the checkout's path made relative, and the WHISPER_ switches. */
  const server = (r: Run) => ({
    args: [...r.env].filter(([k]) => k.startsWith(`${WHISPER}Args__`))
      .sort(([a], [b]) => Number(a.split("__").pop()) - Number(b.split("__").pop())).map(([, v]) => v.replace(r.root, "<root>")),
    switches: [...r.env].filter(([k]) => /^WHISPER_(MICROPHONE|SPEAKER)$/.test(k)).map(([k, v]) => `${k}=${v}`).sort(),
  });

  it("writes the orkeonCode block alone to the read-only /user-config mount, as ./orkeon-code does", () => {
    const settings = { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" }, orkeonCode: { "tools.extra": "search_issues:read" } };
    const r = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" }, settings });
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(r.args.includes(`${r.state}/user-config:/user-config:ro`), r.args.join(" "));
    deepStrictEqual(JSON.parse(readFileSync(join(r.state, "user-config", "config.json"), "utf-8")), settings.orkeonCode);
  });

  it("prints --version as ./orkeon-code does, with nothing configured, and starts nothing", () => {
    for (const flag of ["--version", "-Version"]) {
      const r = launch({ shell: "pwsh", args: [flag], bin: TOOL, bare: true, install: true, files: { VERSION: "1.0.0-rc.6\n" } });
      strictEqual(r.status, 0, r.stderr + r.stdout);
      const lines = r.stdout.split("\n");
      strictEqual(lines[0], `orkeon-code ${CODE_VERSION} (install: ${r.root})`);
      strictEqual(lines[1], `Orkeon ${RUNTIME_VERSION} expected, found: 1.0.0-rc.6 (orkeon-repl, ${join(r.root, "..", "VERSION")})`);
      strictEqual(r.cwd, "", "the REPL did not start");
    }
  });

  it("starts the REPL named by a one-word ORKEON_REPL or found on PATH, from the project", () => {
    const r = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 0, r.stderr + r.stdout);
    strictEqual(r.cwd, r.project);
    const named = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_REPL: "orkeon-repl" } });
    strictEqual(named.status, 0, named.stderr + named.stdout);
  });

  it("declares the server as ./orkeon-code does, case by case", () => {
    const audio = scratchDir("orkeon-code-audio-");
    for (const extra of [
      {}, { ORKEON_CODE_VOICE: "1" }, { ORKEON_CODE_VOICE: "1", TTS_BACKEND: "http" }, { TTS_BACKEND: " OpenAI", WHISPER_DEVICE: "CUDA" },
      { ORKEON_CODE_VOICE: "1", WHISPER_BACKEND: "openai", WHISPER_DEVICE: "cuda" }, { ORKEON_CODE_VOICE: "true", TTS_BACKEND: "Piper" },
    ] as Record<string, string>[]) {
      const env = { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio, ...extra };
      const bash = launch({ args: ["--mode", "tool"], bin: TOOL, env });
      const pwsh = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: TOOL, env });
      strictEqual(pwsh.status, 0, pwsh.stderr + pwsh.stdout);
      deepStrictEqual(server(pwsh), server(bash), JSON.stringify(extra));
      deepStrictEqual(mountRoots(pwsh.args), mountRoots(bash.args));
    }
  });

  it("leaves the server out for the reasons ./orkeon-code does, in the same words: no uv, declared elsewhere, docker", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const base = { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio };
    const cases: { name: string; mode: string; opts: Omit<Parameters<typeof launch>[0], "shell" | "args">; said: string }[] = [
      { name: "no uv", mode: "tool", opts: { bin: { "orkeon-repl": recorder() }, env: base }, said: "uv is not on PATH: speech-to-text is off" },
      {
        name: "settings file, any case", mode: "tool",
        opts: { bin: TOOL, env: base, settings: { Llm: { Model: "m" }, MCP: { Servers: { Whisper: { Command: "/opt/uv" } } } } },
        said: 'declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored',
      },
      {
        name: "environment", mode: "tool", opts: { bin: TOOL, env: { ...base, [`${WHISPER}Url`]: "http://host.docker.internal:8765/mcp" } },
        said: 'the environment declares a "whisper" MCP server (ORKEON_MCP__Servers__whisper__*)',
      },
      { name: "docker", mode: "docker", opts: { bin: { docker: recorder(), uv: "#!/bin/sh\n" }, env: base }, said: "ORKEON_CODE_AUDIO_DIR is ignored in docker mode" },
    ];
    for (const c of cases) {
      const bash = launch({ ...c.opts, args: ["--mode", c.mode] });
      const pwsh = launch({ ...c.opts, shell: "pwsh", args: ["-Mode", c.mode] });
      strictEqual(pwsh.status, 0, `${c.name}: ${pwsh.stderr}${pwsh.stdout}`);
      // Write-Warning goes to PowerShell's warning stream, which pwsh -File prints on stdout.
      ok(bash.stderr.includes(c.said) && (pwsh.stderr + pwsh.stdout).includes(c.said), `${c.name}: ${bash.stderr} / ${pwsh.stderr}${pwsh.stdout}`);
      deepStrictEqual(server(pwsh), server(bash), c.name);
      deepStrictEqual(mountRoots(pwsh.args), mountRoots(bash.args), c.name);
    }
  });

  it("puts back what it set: a variable that was not set is removed, one that was keeps its value", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const base = scratchDir("orkeon-code-restore-");
    const bin = join(base, "bin");
    mkdirSync(bin);
    for (const [name, body] of Object.entries(TOOL)) { writeFileSync(join(bin, name), body); chmodSync(join(bin, name), 0o755); }
    const settings = join(base, "settings.json");
    writeFileSync(settings, JSON.stringify({ Llm: { Model: "m" } }));
    const script = fileURLToPath(new URL("../orkeon-code.ps1", import.meta.url));
    const names = ["WHISPER_AUDIO_DIR", "WHISPER_MICROPHONE", "WHISPER_SPEAKER", `${WHISPER}Command`, `${WHISPER}Args__0`, `${WHISPER}Args__6`];
    const after = spawnSync(PWSH, ["-NoProfile", "-Command",
      `& '${script}' -Mode tool -Settings '${settings}' -Workspace '${base}' -Trust *> $null; ` +
      `foreach ($n in @(${names.map((n) => `'${n}'`).join(", ")})) { "$n=$(Test-Path "env:$n")=$([Environment]::GetEnvironmentVariable($n))" }`], {
      cwd: base, encoding: "utf-8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: join(base, "state"), RECORD: base, ORKEON_ESBUILD_PATH: "/opt/esbuild",
             ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1", WHISPER_SPEAKER: "kept" },
    });
    strictEqual(after.status, 0, after.stderr);
    deepStrictEqual(after.stdout.trim().split("\n"), names.map((n) => (n === "WHISPER_SPEAKER" ? `${n}=True=kept` : `${n}=False=`)));
  });
});

// ── Folder trust (LI-3) ─────────────────────────────────────────────────────
// The first start in a folder asks, before anything of it is read or mounted; `y` stores it in
// <ORKEON_CODE_HOME>/trusted-folders.json and every folder below it starts silently. Without a terminal an
// untrusted folder is refused (exit 3) unless --trust, or ORKEON_CODE_TRUST=1 with CI=true; neither stores anything.

/** util-linux `script`, which gives the launcher a pseudo-terminal; the prompt cases are Linux-only. */
const PTY = process.platform === "linux" && spawnSync("sh", ["-c", "script --version"], { encoding: "utf-8" }).stdout.includes("util-linux");
const storeOf = (r: Run) => join(r.root, "..", ".orkeon-code", "trusted-folders.json");
const storedFolders = (r: Run) => (JSON.parse(readFileSync(storeOf(r), "utf-8")) as { folders: { path: string }[] }).folders.map((f) => f.path);
const TOOL_START = { args: ["--mode", "tool"], bin: TOOL_REPL, env: ESBUILD };

describe("orkeon-code, folder trust", () => {
  it("refuses an untrusted folder without a terminal: exit 3, --trust named, nothing started", () => {
    const r = launch({ ...TOOL_START, trusted: false });
    strictEqual(r.status, 3, r.stderr);
    ok(r.stderr.includes(`${r.project} is not a trusted folder`) && r.stderr.includes("--trust"), r.stderr);
    ok(r.stderr.includes(`orkeon-code trust add ${r.project}`), r.stderr);
    strictEqual(r.cwd, "", "the REPL did not start");
    ok(!existsSync(join(r.state, "output")), "no state folder made");
  });

  it("--trust starts this run and stores nothing", () => {
    const r = launch({ ...TOOL_START, args: ["--mode", "tool", "--trust"], trusted: false });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    ok(!r.args.includes("--trust"), "not forwarded to the REPL");
    ok(!existsSync(storeOf(r)), "nothing stored");
  });

  it("honours ORKEON_CODE_TRUST=1 only with CI=true, and stores nothing", () => {
    const alone = launch({ ...TOOL_START, env: { ...ESBUILD, ORKEON_CODE_TRUST: "1" }, trusted: false });
    strictEqual(alone.status, 3, alone.stderr);
    const ci = launch({ ...TOOL_START, env: { ...ESBUILD, ORKEON_CODE_TRUST: "1", CI: "true" }, trusted: false });
    strictEqual(ci.status, 0, ci.stderr);
    ok(!existsSync(storeOf(ci)), "nothing stored");
    const other = launch({ ...TOOL_START, env: { ...ESBUILD, ORKEON_CODE_TRUST: "1", CI: "1" }, trusted: false });
    strictEqual(other.status, 3, "CI must be exactly true");
  });

  it("starts silently in a folder below a trusted one", () => {
    const nested = scratchDir("orkeon-code-nested-");
    mkdirSync(join(nested, "deep/er"), { recursive: true });
    const home = scratchDir("orkeon-code-home-");
    writeFileSync(join(home, "trusted-folders.json"), trustStore([nested]));
    const t = launch({ ...TOOL_START, args: ["--mode", "tool", "--workspace", join(nested, "deep/er")], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
    strictEqual(t.status, 0, t.stderr);
    strictEqual(t.cwd, join(nested, "deep/er"));
    ok(!t.stderr.includes("trust"), t.stderr);
    // A sibling whose name starts like the trusted folder is not below it.
    mkdirSync(`${nested}-other`);
    scratch.push(`${nested}-other`);
    const u = launch({ ...TOOL_START, args: ["--mode", "tool", "--workspace", `${nested}-other`], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
    strictEqual(u.status, 3, u.stderr);
  });

  it("checks a symlinked folder as its target, and mounts the target", () => {
    const real = scratchDir("orkeon-code-real-");
    const links = scratchDir("orkeon-code-links-");
    symlinkSync(real, join(links, "link"));
    const home = scratchDir("orkeon-code-home-");
    writeFileSync(join(home, "trusted-folders.json"), trustStore([real]));
    const r = launch({ ...TOOL_START, args: ["--mode", "tool", "--workspace", join(links, "link")], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(mountOf(r, "/workspace"), `${real}:/workspace:rw`);
    writeFileSync(join(home, "trusted-folders.json"), trustStore([join(links, "link")]));
    const s = launch({ ...TOOL_START, args: ["--mode", "tool", "--workspace", join(links, "link")], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
    strictEqual(s.status, 3, "the link's own name is not the folder");
  });

  it("refuses a corrupt store, names it and keeps it as it was", () => {
    for (const text of ["{ not json", '{\n  "version": 2,\n  "folders": []\n}\n', '{"version":1,"folders":[]}']) {
      const home = scratchDir("orkeon-code-home-");
      writeFileSync(join(home, "trusted-folders.json"), text);
      const r = launch({ ...TOOL_START, env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
      strictEqual(r.status, 1, r.stderr);
      ok(r.stderr.includes(`${join(home, "trusted-folders.json")} is not a trust store this launcher wrote`), r.stderr);
      strictEqual(r.cwd, "", "the REPL did not start");
      const add = spawnSync("bash", [join(r.root, "orkeon-code"), "trust", "add", r.project], { encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: home, ORKEON_CODE_HOME: home } });
      strictEqual(add.status, 1, add.stderr);
      strictEqual(readFileSync(join(home, "trusted-folders.json"), "utf-8"), text, "kept as it was");
    }
  });

  it("--demo trusts its own fixture", () => {
    const r = launch({ args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, files: USER_SETTINGS, trusted: false });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, join(r.root, "fixtures/sample-repo"));
    ok(!existsSync(storeOf(r)), "nothing stored");
  });

  it("docker mode checks on the host, before docker runs", () => {
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() }, trusted: false });
    strictEqual(r.status, 3, r.stderr);
    strictEqual(r.cwd, "", "docker did not run");
  });

  it("trust add, list and remove keep the store in the launchers' layout, valid JSON whatever the path", () => {
    const home = scratchDir("orkeon-code-home-");
    const odd = join(scratchDir("orkeon-code-odd-"), 'a "quoted" \\ folder');
    mkdirSync(odd);
    const plain = scratchDir("orkeon-code-plain-");
    const env = { PATH: "/usr/bin:/bin", HOME: home, ORKEON_CODE_HOME: home };
    const L = fileURLToPath(new URL("../orkeon-code", import.meta.url));
    const trust = (...a: string[]) => spawnSync("bash", [L, "trust", ...a], { encoding: "utf-8", env });
    strictEqual(trust("list").stdout, "", "an absent store is empty");
    strictEqual(trust("add", odd).status, 0);
    strictEqual(trust("add", plain).status, 0);
    ok(trust("add", join(plain, ".")).stdout.includes("already trusted"), "a folder is stored once");
    mkdirSync(join(plain, "sub"));
    ok(trust("add", join(plain, "sub")).stdout.includes(`already trusted, through ${plain}`));
    const store = JSON.parse(readFileSync(join(home, "trusted-folders.json"), "utf-8"));
    strictEqual(store.version, 1);
    deepStrictEqual(store.folders.map((f: { path: string }) => f.path), [odd, plain]);
    ok(store.folders.every((f: { trustedAt: string }) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(f.trustedAt)));
    strictEqual(statSync(join(home, "trusted-folders.json")).mode & 0o777, 0o600);
    deepStrictEqual(trust("list").stdout.split("\n").filter(Boolean).map((l) => l.replace(/ {2}\(trusted .*\)$/, "")), [odd, plain]);
    strictEqual(trust("remove", join(plain, "sub")).status, 1, "trusted through its parent, not in the store");
    strictEqual(trust("remove", odd).status, 0);
    deepStrictEqual(JSON.parse(readFileSync(join(home, "trusted-folders.json"), "utf-8")).folders.map((f: { path: string }) => f.path), [plain]);
    rmSync(plain, { recursive: true });
    strictEqual(trust("remove", plain).status, 0, "a folder gone is removed by its stored name");
    deepStrictEqual(JSON.parse(readFileSync(join(home, "trusted-folders.json"), "utf-8")).folders, []);
    strictEqual(trust("check", odd).status, 3);
    strictEqual(trust("check", odd, "--trust").status, 0);
    strictEqual(trust("frobnicate").status, 1);
  });

  describe("asked in a terminal", { skip: PTY ? false : "util-linux script is not available" }, () => {
    it("n: exit 0, nothing stored, nothing mounted; y: stored, and the next start is silent", () => {
      const n = launch({ ...TOOL_START, trusted: false, tty: "n\n" });
      strictEqual(n.status, 0, n.stdout);
      ok(n.stdout.includes("do you trust the files in this folder?") && n.stdout.includes(n.project), n.stdout);
      ok(n.stdout.includes("AGENTS.md") && n.stdout.includes(".orkeon/repo.yaml"), n.stdout);
      ok(n.stdout.includes("nothing started"), n.stdout);
      ok(!n.stdout.includes("This trusts every folder below it"), "not $HOME");
      strictEqual(n.cwd, "", "the REPL was never called");
      ok(!existsSync(storeOf(n)) && !existsSync(join(n.state, "output")), "nothing stored, no state made");
      const eof = launch({ ...TOOL_START, trusted: false, tty: "" });
      strictEqual(eof.status, 0, "no answer is a no");
      strictEqual(eof.cwd, "");

      const y = launch({ ...TOOL_START, trusted: false, tty: "y\n" });
      strictEqual(y.status, 0, y.stdout);
      strictEqual(y.cwd, y.project);
      deepStrictEqual(storedFolders(y), [y.project]);
      // The next start in the same folder, without a terminal: silent, through the store.
      const base = join(y.root, "..");
      rmSync(join(base, "record"), { recursive: true });
      mkdirSync(join(base, "record"));
      const again = spawnSync("bash", [join(y.root, "orkeon-code"), "--settings", join(base, "settings.json"), "--workspace", y.project, "--mode", "tool"], {
        cwd: base, encoding: "utf-8",
        env: { PATH: `${join(base, "bin")}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: y.state, RECORD: join(base, "record"), ...ESBUILD },
      });
      strictEqual(again.status, 0, again.stderr);
      ok(!again.stderr.includes("trust"), again.stderr);
      strictEqual(readFileSync(join(base, "record", "cwd"), "utf-8").trim(), y.project);
    });

    it("says that trusting $HOME trusts every folder below it", () => {
      const r = launch({ ...TOOL_START, args: ["--mode", "tool", "--workspace", "."], trusted: false, tty: "n\n" });
      // The scratch base is both the launcher's cwd and HOME.
      strictEqual(r.status, 0, r.stdout);
      ok(r.stdout.includes("This trusts every folder below it."), r.stdout);
    });

    it("--trust in a terminal starts without asking", () => {
      const r = launch({ ...TOOL_START, args: ["--mode", "tool", "--trust"], trusted: false, tty: "" });
      strictEqual(r.status, 0, r.stdout);
      ok(!r.stdout.includes("do you trust"), r.stdout);
      ok(!existsSync(storeOf(r)));
    });
  });
});

describe("scripts/run-crew.sh checks the folder as the launcher does", () => {
  function runCrew(extra: string[], opts: { trusted?: boolean; env?: Record<string, string> } = {}) {
    const base = scratchDir("orkeon-code-run-crew-");
    const root = join(base, "checkout");
    for (const dir of ["scripts", "config", ".git", "src", "bin", "record"].map((d) => (d === "bin" || d === "record" ? join(base, d) : join(root, d)))) mkdirSync(dir, { recursive: true });
    mkdirSync(join(base, "project"));
    for (const file of ["orkeon-code", ".orkeon-version", "package.json", "scripts/run-crew.sh", "scripts/setup-fixture.sh"]) {
      copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(root, file));
    }
    writeFileSync(join(root, "config/appsettings.local.json"), SETTINGS_TEXT);
    writeFileSync(join(root, "src/crew.ork.ts"), "");
    writeFileSync(join(base, "bin/dotnet"), DOTNET);
    chmodSync(join(base, "bin/dotnet"), 0o755);
    if (opts.trusted) {
      mkdirSync(join(base, ".orkeon-code"));
      writeFileSync(join(base, ".orkeon-code/trusted-folders.json"), trustStore([join(base, "project")]));
    }
    const r = spawnSync("bash", [join(root, "scripts/run-crew.sh"), join(root, "src/crew.ork.ts"), ...extra], {
      encoding: "utf-8", cwd: base,
      env: { PATH: `${join(base, "bin")}:/usr/bin:/bin`, HOME: base, RECORD: join(base, "record"), ORKEON_CODE_WORKSPACE: join(base, "project"), ...opts.env },
    });
    let calls: string[] = [];
    try { calls = readFileSync(join(base, "record/calls"), "utf-8").split("\n").filter(Boolean); } catch { /* never called */ }
    return { ...r, calls, project: join(base, "project") };
  }

  it("refuses an untrusted project without a terminal, before dotnet runs", () => {
    const r = runCrew([]);
    strictEqual(r.status, 3, r.stderr);
    ok(r.stderr.includes("is not a trusted folder"), r.stderr);
    deepStrictEqual(r.calls, []);
  });

  it("runs a trusted project, and --trust for one run, never forwarded to orkeon run", () => {
    const t = runCrew(["--inputs", "{}"], { trusted: true });
    strictEqual(t.status, 0, t.stderr);
    ok(t.calls.some((c) => c.includes("tool run orkeon run") && c.includes(`${t.project}:/workspace:rw`)), t.calls.join("\n"));
    const once = runCrew(["--trust", "--inputs", "{}"]);
    strictEqual(once.status, 0, once.stderr);
    const run = once.calls.find((c) => c.includes("tool run orkeon run")) ?? "";
    ok(run.includes("--inputs {}") && !run.includes("--trust"), run);
  });
});

// ── The settings (LI-2) ─────────────────────────────────────────────────────
// First found: --settings, ORKEON_CODE_SETTINGS, config/appsettings.local.json (a clone), ~/.orkeon-code/appsettings.json,
// ~/.config/orkeon-code/appsettings.json (the old place, with a warning), Orkeon's own ~/.config/Orkeon/appsettings.json
// (then no --settings: the REPL reads it itself). None and a terminal: setup.

const RUNTIME_SETTINGS_TEXT = JSON.stringify({ Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1", ApiKeyEnvVar: "RUNTIME_KEY" } });

describe("orkeon-code, where the settings come from", () => {
  it("with Orkeon's own file alone, passes no --settings and still finds the key's variable", () => {
    const r = launch({ ...TOOL_START, bare: true, install: true, files: { ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT } });
    strictEqual(r.status, 0, r.stderr);
    ok(!r.args.includes("--settings"), r.args.join(" "));
    ok(r.stderr.includes("export RUNTIME_KEY"), r.stderr);
    ok(r.stdout.includes(`settings : ${join(r.root, "..", ".config/Orkeon/appsettings.json")} (Orkeon's own, read by the REPL)`), r.stdout);
    const x = launch({ ...TOOL_START, bare: true, install: true, env: { ...ESBUILD, XDG_CONFIG_HOME: "/elsewhere-xdg", RUNTIME_KEY: "set" },
      files: { ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT } });
    strictEqual(x.status, 1, "an absolute XDG_CONFIG_HOME moves the place, as for the runtime");
  });

  it("docker mode mounts Orkeon's own file and names it: the container has no host HOME", () => {
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() }, bare: true, install: true,
      files: { ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT } });
    strictEqual(r.status, 0, r.stderr);
    ok(r.args.includes(`${join(r.root, "..", ".config/Orkeon/appsettings.json")}:/work/settings.json:ro`), r.args.join(" "));
    ok(r.args.join(" ").includes("--settings /work/settings.json"), r.args.join(" "));
  });

  it("reads the old ~/.config/orkeon-code file with a warning, and ~/.orkeon-code/appsettings.json before it", () => {
    const old = launch({ ...TOOL_START, bare: true, install: true, files: { ...USER_SETTINGS, ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT } });
    strictEqual(old.status, 0, old.stderr);
    const legacy = join(old.root, "..", ".config/orkeon-code/appsettings.json");
    ok(old.args.includes(legacy), old.args.join(" "));
    ok(old.stderr.includes(`${legacy} is the old place of the settings: move it to ${join(old.root, "..", ".orkeon-code/appsettings.json")}`), old.stderr);
    const home = launch({ ...TOOL_START, bare: true, install: true, files: { ...USER_SETTINGS, ".orkeon-code/appsettings.json": SETTINGS_TEXT } });
    strictEqual(home.status, 0, home.stderr);
    ok(home.args.includes(join(home.root, "..", ".orkeon-code/appsettings.json")), home.args.join(" "));
    ok(!home.stderr.includes("old place"), home.stderr);
    const clone = launch({ ...TOOL_START, bare: true, files: { "checkout/config/appsettings.local.json": SETTINGS_TEXT, ".orkeon-code/appsettings.json": SETTINGS_TEXT } });
    ok(clone.args.includes(join(clone.root, "config/appsettings.local.json")), "a clone's local file first");
  });

  it("setup refuses to run without a terminal", () => {
    const r = launch({ args: ["setup"], bin: {}, bare: true, install: true });
    strictEqual(r.status, 1);
    ok(r.stderr.includes("setup asks its questions in a terminal"), r.stderr);
    ok(!existsSync(join(r.root, "..", ".orkeon-code/appsettings.json")));
  });

  describe("setup, in a terminal", { skip: PTY ? false : "util-linux script is not available" }, () => {
    const written = (r: Run) => join(r.root, "..", ".orkeon-code/appsettings.json");

    it("writes ~/.orkeon-code/appsettings.json, mode 600, with the model and the name of the key's variable, never a key", () => {
      const r = launch({ args: ["setup"], bin: {}, bare: true, install: true, files: { "checkout/config/appsettings.example.json": read("config/appsettings.example.json") },
        tty: "1\nsk-abcdef0123456789abcdef\nA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\nmy-model\nsk-live-123secret\nA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\nMY_KEY\n" });
      strictEqual(r.status, 0, r.stdout);
      const text = readFileSync(written(r), "utf-8");
      const settings = JSON.parse(text);
      strictEqual(settings.Llm.Model, "my-model");
      strictEqual(settings.Llm.ApiKeyEnvVar, "MY_KEY");
      strictEqual(settings.Llm.BaseUrl, "https://api.deepseek.com");
      // Keys pasted at the model and at the variable questions: refused, never stored, never said back (the terminal
      // echoes what is typed, once per answer).
      for (const [key, typed] of [["sk-abcdef0123456789abcdef", 1], ["sk-live-123secret", 1], ["A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6", 2]] as const) {
        ok(!text.includes(key), `${key} is not in the file`);
        strictEqual(r.stdout.split(key).length - 1, typed, r.stdout);
      }
      ok(r.stdout.includes("not a model id"), r.stdout);
      ok(r.stdout.includes("not a variable name"), r.stdout);
      ok(r.stdout.includes("export MY_KEY=<your key>"), r.stdout);
      strictEqual(statSync(written(r)).mode & 0o777, 0o600);
    });

    it("keeps an existing file unless told to replace it, and the Ollama example asks no variable", () => {
      const files = { "checkout/config/appsettings.ollama.example.json": read("config/appsettings.ollama.example.json"), ".orkeon-code/appsettings.json": "{}" };
      const kept = launch({ args: ["setup"], bin: {}, bare: true, install: true, files, tty: "\n" });
      strictEqual(kept.status, 1, kept.stdout);
      strictEqual(readFileSync(written(kept), "utf-8"), "{}");
      const replaced = launch({ args: ["setup"], bin: {}, bare: true, install: true, files, tty: "y\n2\n\n" });
      strictEqual(replaced.status, 0, replaced.stdout);
      const settings = JSON.parse(readFileSync(written(replaced), "utf-8"));
      strictEqual(settings.Llm.Model, "qwen3.5:2b");
      strictEqual(settings.Llm.ApiKeyEnvVar, undefined);
      ok(!replaced.stdout.includes("environment variable that holds the API key ["), replaced.stdout);
    });

    it("runs on a first start with no settings, then starts the REPL with the file written", () => {
      const r = launch({ ...TOOL_START, bare: true, install: true, files: { "checkout/config/appsettings.example.json": read("config/appsettings.example.json") },
        tty: "\n\n\n" });
      strictEqual(r.status, 0, r.stdout);
      ok(r.args.includes(written(r)), r.args.join(" "));
      strictEqual(r.cwd, r.project);
    });
  });
});

describe("orkeon-code.ps1 checks the folder and finds the settings as ./orkeon-code does (read here)", () => {
  const script = read("orkeon-code.ps1");

  it("binds no argument by position, so trust and setup reach the script", () => {
    ok(script.includes("[CmdletBinding(PositionalBinding = $false)]"), "no positional binding");
    ok(script.includes("$Extra[0] -cin @('trust', 'setup')"), "the subcommands");
    ok(script.includes("elseif ($name -eq '--trust') { $Trust = [switch] $true }"), "--trust as a long option");
  });

  it("checks the folder before the settings, refuses without a terminal with exit 3, a decline with 0", () => {
    ok(script.indexOf("Confirm-Trusted $Workspace $Trust.IsPresent 0") > 0, "the check");
    ok(script.indexOf("Confirm-Trusted $Workspace $Trust.IsPresent 0") < script.indexOf("$runtimeOwn = $false"), "before the settings");
    ok(script.includes("if ([Console]::IsInputRedirected) {") && script.includes("    exit 3"), "no terminal: 3");
    ok(script.includes("$env:ORKEON_CODE_TRUST -eq '1' -and $env:CI -ceq 'true'"), "CI only");
    ok(script.includes("'  This trusts every folder below it.'"), "the $HOME line");
  });

  it("writes the store in the bash launcher's layout", () => {
    ok(script.includes(`'    { "path": "' + (& $escape $_.Path) + '", "trustedAt": "' + (& $escape $_.TrustedAt) + '" }'`), "one folder per line");
    ok(script.includes(`"{\`n  \`"version\`": 1,\`n$folders}\`n"`), "the frame");
    ok(script.includes("Move-Item -LiteralPath $tmp -Destination $file -Force"), "a rename");
  });

  it("falls back on Orkeon's own file without passing --settings, and warns on the old place", () => {
    ok(script.includes("$runtimeSettings = Join-Path $configBase 'Orkeon/appsettings.json'"), "Orkeon's own");
    ok(script.includes("if ($settings) { @('--settings', $settings) }"), "--settings only when one is passed");
    ok(script.includes("$(if ($runtimeOwn) { '' } else { $Settings })"), "tool mode passes none for Orkeon's own");
    ok(script.includes("is the old place of the settings: move it to $homeSettings."), "the warning");
    ok(script.includes("Invoke-Setup $homeSettings"), "setup");
  });
});

describe("orkeon-code.ps1, trust and settings, run where pwsh is installed", { skip: PWSH ? false : "pwsh is not on PATH" }, () => {
  it("refuses the corrupt stores ./orkeon-code refuses, and keeps them", () => {
    for (const text of ["{ not json", '{"version":1,"folders":[]}']) {
      const home = scratchDir("orkeon-code-home-");
      writeFileSync(join(home, "trusted-folders.json"), text);
      const r = launch({ shell: "pwsh", ...TOOL_START, args: ["-Mode", "tool"], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });
      strictEqual(r.status, 1, r.stderr + r.stdout);
      strictEqual(readFileSync(join(home, "trusted-folders.json"), "utf-8"), text);
    }
  });

  it("refuses an untrusted folder without a terminal, starts with -Trust, and storing nothing", () => {
    const r = launch({ shell: "pwsh", ...TOOL_START, args: ["-Mode", "tool"], trusted: false });
    strictEqual(r.status, 3, r.stderr + r.stdout);
    strictEqual(r.cwd, "");
    const t = launch({ shell: "pwsh", ...TOOL_START, args: ["-Mode", "tool", "--trust"], trusted: false });
    strictEqual(t.status, 0, t.stderr + t.stdout);
    ok(!existsSync(storeOf(t)));
  });

  it("reads and writes the store as ./orkeon-code does", () => {
    const r = launch({ shell: "pwsh", args: ["trust", "add", "project"], bin: {}, trusted: false });
    strictEqual(r.status, 0, r.stderr + r.stdout);
    const check = spawnSync("bash", [join(r.root, "orkeon-code"), "trust", "list"], {
      encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: join(r.root, ".."), ORKEON_CODE_HOME: join(r.root, "..", ".orkeon-code") },
    });
    strictEqual(check.status, 0, check.stderr);
    ok(check.stdout.startsWith(`${r.project}  (trusted `), check.stdout);
    // And the store it wrote lets the folder start (its dates are read as strings).
    const again = spawnSync(PWSH, ["-NoProfile", "-File", join(r.root, "orkeon-code.ps1"), "trust", "check", r.project], {
      encoding: "utf-8", env: { PATH: "/usr/bin:/bin", HOME: join(r.root, ".."), ORKEON_CODE_HOME: join(r.root, "..", ".orkeon-code") },
    });
    strictEqual(again.status, 0, again.stderr + again.stdout);
  });

  it("with Orkeon's own file alone, passes no --settings", () => {
    const r = launch({ shell: "pwsh", ...TOOL_START, args: ["-Mode", "tool"], bare: true, install: true,
      files: { ".config/Orkeon/appsettings.json": RUNTIME_SETTINGS_TEXT } });
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(!r.args.includes("--settings"), r.args.join(" "));
  });
});
