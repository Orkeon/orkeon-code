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
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
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
}): Run {
  const base = scratchDir("orkeon-code-launcher-");
  const root = join(base, "checkout");
  const bin = join(base, "bin");
  const project = join(base, "project");
  const state = join(base, "state");
  const record = join(base, "record");
  for (const dir of [root, bin, project, record]) mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(opts.projectFiles ?? {})) writeFileSync(join(project, name), content);
  for (const file of ["orkeon-code", "orkeon-code.ps1", ".orkeon-version", "package.json"]) {
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(root, file));
  }
  const settings = join(base, "settings.json");
  writeFileSync(settings, JSON.stringify(opts.settings ?? { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" } }));
  for (const [name, body] of Object.entries(opts.bin)) {
    writeFileSync(join(bin, name), body);
    chmodSync(join(bin, name), 0o755);
  }
  const [command, args] = opts.shell === "pwsh"
    ? [PWSH, ["-NoProfile", "-File", join(root, "orkeon-code.ps1"), "-Settings", settings, "-Workspace", project, ...opts.args]]
    : ["bash", [join(root, "orkeon-code"), "--settings", settings, "--workspace", project, ...opts.args]];
  const run = spawnSync(command, args, {
    cwd: base,
    encoding: "utf-8",
    env: { PATH: `${bin}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: state, RECORD: record, ...opts.env },
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

/** The virtual roots of the --mount arguments. */
const mountRoots = (args: string[]) =>
  args.flatMap((a, i) => (args[i - 1] === "--mount" ? [a.split(":")[1]] : []));

const RESERVED = /^\/(sandbox|credentials|cli-commands|crews)/;

describe("orkeon-code, tool and source modes on Orkeon rc.6", () => {
  it("tool mode starts the REPL from the project, external mounts allowed, three distinct roots", () => {
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild" } });
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    strictEqual(r.env.get("ORKEON_ALLOW_EXTERNAL_MOUNTS"), "1");
    deepStrictEqual(r.args, [
      "--runner=scripted-commands", "--commands-dir", join(r.root, "src/commands"), "--crews-dir", join(r.root, "src/crews"),
      "--settings", join(r.root, "..", "settings.json"),
      "--mount", `${r.project}:/workspace:rw`, "--mount", `${r.state}/output:/output:rw`, "--mount", `${r.state}/tmp:/tmp:rw`,
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
    deepStrictEqual(roots, ["/workspace", "/output", "/tmp"]);
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
    deepStrictEqual(roots, ["/workspace", "/output", "/tmp", "/audio", "/transcripts"]);
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
    deepStrictEqual(mountRoots(r.args), ["/workspace", "/output", "/tmp"]);
    ok(!r.stdout.includes("audio"), r.stdout);
  });

  it("starts without the server, and says why, when uv is missing or a settings file declares one", () => {
    const audio = scratchDir("orkeon-code-audio-");
    const noUv = launch({
      args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio },
    });
    strictEqual(noUv.status, 0, noUv.stderr);
    ok(noUv.stderr.includes("uv is not on PATH: speech-to-text is off"), noUv.stderr);
    deepStrictEqual([whisperEnv(noUv), mountRoots(noUv.args)], [[], ["/workspace", "/output", "/tmp"]]);
    const declared = launch({
      args: ["--mode", "tool"], bin: TOOL, env: { ORKEON_ESBUILD_PATH: "/opt/esbuild", ORKEON_CODE_AUDIO_DIR: audio },
      settings: { Llm: { Model: "m" }, MCP: { Servers: { whisper: { Command: "/opt/uv" } } } },
    });
    strictEqual(declared.status, 0, declared.stderr);
    ok(declared.stderr.includes('declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored'), declared.stderr);
    deepStrictEqual([whisperEnv(declared), mountRoots(declared.args)], [[], ["/workspace", "/output", "/tmp"]]);
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
    deepStrictEqual([whisperEnv(inEnv), mountRoots(inEnv.args)], [[`${WHISPER}Url`], ["/workspace", "/output", "/tmp"]], "left as it was");
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

describe("orkeon-code.ps1 follows the same rules (read here; run below, where pwsh is installed)", () => {
  const script = read("orkeon-code.ps1");

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

  it("keeps a one-word ORKEON_REPL argument an array (an if statement would unroll it into characters)", () => {
    ok(script.includes("$rest = @($repl | Select-Object -Skip 1)"), "orkeon-code.ps1 must build $rest as an array");
  });

  it("puts back every variable it sets, so none stays in the calling session", () => {
    const set = [...new Set([...script.matchAll(/\$env:(\w+)\s*=(?!=)/g)].map((m) => m[1]))].sort();
    deepStrictEqual(set, ["ORKEON_ALLOW_EXTERNAL_MOUNTS", "ORKEON_ESBUILD_PATH", "ORKEON_Llm__Model", GATE,
      "WHISPER_AUDIO_DIR", "WHISPER_OUT_DIR", "WHISPER_MICROPHONE", "WHISPER_SPEAKER", "ORKEON_MCP__Servers__whisper__Transport",
      "ORKEON_MCP__Servers__whisper__Command"].sort());
    // The server's arguments are set in a loop, by name: Args__0 to Args__11 at most (run, --project, the folder,
    // --extra voice, --extra tts, --extra openai, --extra cuda, the script).
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
      `& '${script}' -Mode tool -Settings '${settings}' -Workspace '${base}' *> $null; ` +
      `foreach ($n in @(${names.map((n) => `'${n}'`).join(", ")})) { "$n=$(Test-Path "env:$n")=$([Environment]::GetEnvironmentVariable($n))" }`], {
      cwd: base, encoding: "utf-8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: base, ORKEON_CODE_STATE: join(base, "state"), RECORD: base, ORKEON_ESBUILD_PATH: "/opt/esbuild",
             ORKEON_CODE_AUDIO_DIR: audio, ORKEON_CODE_VOICE: "1", WHISPER_SPEAKER: "kept" },
    });
    strictEqual(after.status, 0, after.stderr);
    deepStrictEqual(after.stdout.trim().split("\n"), names.map((n) => (n === "WHISPER_SPEAKER" ? `${n}=True=kept` : `${n}=False=`)));
  });
});
