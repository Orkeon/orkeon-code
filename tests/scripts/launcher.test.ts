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
//   node --test tests/scripts/launcher.test.ts
import { after, describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ARCHIVE_VERSION, BASH_GATE, BLOCK, CODE_VERSION, CORRUPT_STORES, DEB_WRAPPER, DOTNET, CONSOLE_APP_DLL, ESBUILD, EXAMPLE_SETTINGS,
  EXAMPLE_SETTINGS_FILES, GATE, KEEP_OUT_OF_RANGE, NO_FILE_SETTINGS, NOT_AT_THE_PIN, OLLAMA_AND_EXISTING, PERSIST, PINNED_SDK, PROJECT_NAMES, PS1_ARGS_LOOP,
  PS1_CLONE_OR_INSTALL, PS1_DOCKER_TTY, PS1_FROM_PROJECT, PS1_GATE, PS1_MODES, PS1_SESSION_MOUNTS, PS1_SESSIONS, PS1_SET_VARIABLES,
  PS1_SETTINGS, PS1_SLUG, PS1_SPEECH, PS1_STORE_LAYOUT, PS1_SUBCOMMANDS, PS1_TRUST_CHECK, PS1_TRUST_REFUSAL, PS1_USER_SETTINGS,
  PS1_VERSION_LINES, PTY, PWSH, RESTORED_IN_FINALLY, RESTORED_NAMES, ROOTS, RUNTIME_SETTINGS, RUNTIME_SLUGS, RUNTIME_PIN,
  SERVER_CASES, SERVER_LEFT_OUT, SESSIONS_DIR, SETTINGS_TEXT, SETTINGS_WITH_BLOCK, SLUG_PATHS, SPEECH_TOOL, START_SCRIPT, TOOL_REPL,
  TOOL_START, USER_SETTINGS, WHISPER, audioEnv, bashOf, ciStarts, corruptHome, crewSource, fullHistory, launch, launchWithNode, orkeonCheckoutAtAnotherCommit,
  leftBeside, linkedFolder, modeStart, mostWhisperArgs, mountOf, mountRoots, namedProjectStart, nestedTrust, orkeonCheckout,
  pwshOf, read, recorder, removeScratch, runCrew, runPs1ThenPrint, scratchDir, scratchFolder, serverArgs, serverOf,
  sessionScene, slugOf, sourceModeCalls, staleLock, startAgain, storeOf, storedFolders, tokenVarsForwarded, toolModeArgs, trustCli, trustOf, twoSessions,
  untrustedStart, upTo, userFile, variablesSaved, variablesSet, whisperArgNames, whisperArgs, whisperEnv, writtenSettings, historyIds,
} from "./launcher.fixtures.ts";
import {
  assertBefore, assertEveryLineHolds, assertFreeRoots, assertKeysNotKept, assertLacks, assertMentions, assertNoReservedRoot, assertSays,
  assertTrustedAtDates,
} from "./launcher.assertions.ts";
import { WORKSPACE } from "../../src/shared/domain/vfs.ts";

// The scratch folders every launch makes go when the file's tests are done.
after(removeScratch);

describe("the launchers enable the permission gate", () => {
  it("orkeon-code exports it, true unless the caller set it, and passes it to docker", () => {
    // Arrange
    const launcher = "orkeon-code";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, BASH_GATE);
  });

  it("orkeon-code.ps1 sets it, true unless the caller set it, and passes it to docker", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_GATE);
  });

  for (const file of EXAMPLE_SETTINGS_FILES) {
    it(`the example settings turn it on: ${file}`, () => {
      // Arrange
      const name = file;

      // Act
      const settings = JSON.parse(read(name));

      // Assert
      strictEqual(settings.Orkeon.Security.PermissionGate.Enabled, true, file);
    });
  }
});

// ── The bash launcher, run ──────────────────────────────────────────────────

describe("orkeon-code, tool and source modes on Orkeon rc.6", () => {
  it("tool mode starts the REPL from the project, external mounts allowed, four distinct roots", () => {
    // Arrange
    const start = { args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: ESBUILD };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    strictEqual(r.env.get("ORKEON_ALLOW_EXTERNAL_MOUNTS"), "1");
    deepStrictEqual(r.args, toolModeArgs(r));
    assertFreeRoots(mountRoots(r.args));
  });

  it("copies the session's start script into the agent's /tmp and names it", () => {
    // Arrange
    const start = { args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: ESBUILD };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.get(START_SCRIPT), "/tmp/orkeon-code/session-start.ork.ts");
    strictEqual(readFileSync(join(r.state, "tmp/orkeon-code/session-start.ork.ts"), "utf-8"), read("scripts/session-start.ork.ts"));
  });

  it("keeps an empty start script the user exported", () => {
    // Arrange
    const env = { ...ESBUILD, [START_SCRIPT]: "" };

    // Act
    const none = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env });

    // Assert
    strictEqual(none.status, 0, none.stderr);
    strictEqual(none.env.get(START_SCRIPT), "");
  });

  it("source mode refuses to start without ORKEON_SOURCE", () => {
    // Arrange
    const start = { args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: ESBUILD };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1, "no ORKEON_SOURCE: refused");
    ok(r.stderr.includes("ORKEON_SOURCE must name an Orkeon checkout"), r.stderr);
  });

  it("source mode builds in the Orkeon checkout, then runs the assembly from the project", () => {
    // Arrange
    const source = orkeonCheckout();
    // The project pins an SDK the machine may not have: no SDK command may run there.
    const start = { args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: { ...ESBUILD, ORKEON_SOURCE: source }, projectFiles: PINNED_SDK };

    // Act
    const s = launch(start);

    // Assert
    strictEqual(s.status, 0, s.stderr);
    deepStrictEqual(s.calls, sourceModeCalls(source, s));
    strictEqual(s.cwd, s.project);
    strictEqual(s.env.get("ORKEON_ALLOW_EXTERNAL_MOUNTS"), "1");
    deepStrictEqual(s.args.slice(0, 2), [join(source, CONSOLE_APP_DLL), "--runner=scripted-commands"]);
  });

  it("source mode warns when the checkout is at another commit than the pin, and runs it", () => {
    // Arrange
    const source = orkeonCheckoutAtAnotherCommit();
    const start = { args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: { ...ESBUILD, ORKEON_SOURCE: source } };

    // Act
    const s = launch(start);

    // Assert
    strictEqual(s.status, 0, s.stderr);
    ok(s.stderr.includes(`warning: ORKEON_SOURCE is at `) && s.stderr.includes(NOT_AT_THE_PIN), s.stderr);
    deepStrictEqual(s.calls, sourceModeCalls(source, s));
  });

  it("source mode says nothing of the pin when the checkout is not a git repository", () => {
    // Arrange
    const start = { args: ["--mode", "source"], bin: { dotnet: DOTNET }, env: { ...ESBUILD, ORKEON_SOURCE: orkeonCheckout() } };

    // Act
    const s = launch(start);

    // Assert
    ok(!s.stderr.includes("the pin of .orkeon-version"), s.stderr);
  });

  it("source mode stops when the build fails, and starts nothing", () => {
    // Arrange
    const env = { ...ESBUILD, ORKEON_SOURCE: orkeonCheckout(), DOTNET_BUILD_FAILS: "1" };

    // Act
    const r = launch({ args: ["--mode", "source"], bin: { dotnet: DOTNET }, env });

    // Assert
    strictEqual(r.status, 1);
    ok(r.stderr.includes("building src/apps/Orkeon.ConsoleApp in"), r.stderr);
    deepStrictEqual(r.calls.length, 1, "only the build ran");
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("leaves MaxScripts to Orkeon's default and keeps the gate on", () => {
    // Arrange
    const start = { args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: ESBUILD };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.env.has("Orkeon__Cli__ScriptCommands__MaxScripts"), false);
    strictEqual(r.env.get(GATE), "true");
  });
});

describe("orkeon-code, esbuild in tool mode", () => {
  it("trusts the Debian package's orkeon-repl, which points the runtime at its own esbuild", () => {
    // Arrange
    const bin = { "orkeon-repl": DEB_WRAPPER };

    // Act
    const r = launch({ args: ["--mode", "tool"], bin });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.has("ORKEON_ESBUILD_PATH"), false, "the launcher leaves it to the wrapper");
  });

  it("passes an ORKEON_ESBUILD_PATH already set as is", () => {
    // Arrange
    const env = { ORKEON_ESBUILD_PATH: "/opt/esbuild" };

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.get("ORKEON_ESBUILD_PATH"), "/opt/esbuild");
  });

  it("uses an esbuild on PATH", () => {
    // Arrange
    const bin = { "orkeon-repl": recorder(), esbuild: "#!/bin/sh\n" };

    // Act
    const withPath = launch({ args: ["--mode", "tool"], bin });

    // Assert
    strictEqual(withPath.status, 0, withPath.stderr);
  });

  it("stops when there is no esbuild anywhere", () => {
    // Arrange
    const bin = { "orkeon-repl": recorder() };

    // Act
    const none = launch({ args: ["--mode", "tool"], bin });

    // Assert
    strictEqual(none.status, 1);
    ok(none.stderr.includes("esbuild not found: run 'npm ci'"), none.stderr);
  });
});

describe("orkeon-code, docker mode", () => {
  it("runs the last release image, never the pin, multi-arch: no platform forced, no MaxScripts", () => {
    // Arrange
    const image = "ghcr.io/orkeon/orkeon-runners:latest";

    // Act
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() } });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.args.includes(image), r.args.join(" "));
    ok(!r.args.some((a) => a.startsWith("--platform")), r.args.join(" "));
    ok(!r.args.some((a) => a.includes("MaxScripts")), r.args.join(" "));
    ok(r.args.includes(`${GATE}=true`), r.args.join(" "));
    ok(r.args.includes(`${START_SCRIPT}=/tmp/orkeon-code/session-start.ork.ts`), r.args.join(" "));
    deepStrictEqual(mountRoots(r.args), ROOTS);
  });
});

describe("orkeon-code, docker mode, the github tool's token (Orkeon #222)", () => {
  it("hands GITHUB_TOKEN and GH_TOKEN to the container when the operator exported them", () => {
    // Arrange
    const env = { GITHUB_TOKEN: "ghp_x", GH_TOKEN: "gho_y" };

    // Act
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() }, env });

    // Assert
    deepStrictEqual(tokenVarsForwarded(r.args), ["GITHUB_TOKEN", "GH_TOKEN"]);
  });

  it("hands over the variable Orkeon__Tools__GitHub__TokenVariable names, and the setting itself", () => {
    // Arrange
    const env = { Orkeon__Tools__GitHub__TokenVariable: "MY_GH", MY_GH: "ghp_z" };

    // Act
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder() }, env });

    // Assert
    deepStrictEqual(tokenVarsForwarded(r.args), ["Orkeon__Tools__GitHub__TokenVariable", "MY_GH"]);
  });

  it("hands no token variable over when none is exported", () => {
    // Arrange
    const start = { args: ["--mode", "docker"], bin: { docker: recorder() } };

    // Act
    const r = launch(start);

    // Assert
    deepStrictEqual(tokenVarsForwarded(r.args), []);
  });
});

describe("orkeon-code, speech-to-text (ORKEON_CODE_AUDIO_DIR)", () => {
  it("mounts the folder on /audio and the transcripts on /transcripts, read-only, and declares the server", () => {
    // Arrange
    const audio = scratchDir("orkeon-code-audio-");

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env: audioEnv(audio) });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(r.args.slice(-4), ["--mount", `${audio}:/audio:ro`, "--mount", `${r.state}/transcripts:/transcripts:ro`]);
    const roots = mountRoots(r.args);
    deepStrictEqual(roots, [...ROOTS, "/audio", "/transcripts"]);
    assertNoReservedRoot(roots);
    strictEqual(r.env.get("WHISPER_AUDIO_DIR"), audio);
    strictEqual(r.env.get("WHISPER_OUT_DIR"), `${r.state}/transcripts`);
    strictEqual(r.env.get(`${WHISPER}Transport`), "Stdio");
    ok(r.env.get(`${WHISPER}Command`)!.endsWith("/bin/uv"), r.env.get(`${WHISPER}Command`));
    strictEqual(r.env.get(`${WHISPER}TrustAnnotations`), "true", "the gate reads the server's annotations only when trusted (Orkeon #223)");
    deepStrictEqual(whisperArgs(r, upTo(7)), [...serverArgs(r.root, ["tts"]), undefined],
      "Piper, the default speech backend, writes what it would say without the speaker too");
    ok(r.stdout.includes(`  audio    : ${audio} -> /audio`), r.stdout);
    ok(statSync(join(r.state, "transcripts")).isDirectory(), "the transcripts folder exists before the server starts");
  });

  it("keeps the microphone and the speaker closed without ORKEON_CODE_VOICE=1", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"));

    // Act
    const off = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(off.env.has("WHISPER_MICROPHONE"), false);
    strictEqual(off.env.has("WHISPER_SPEAKER"), false);
    ok(![...off.env.values()].includes("voice"), "no voice extra");
  });

  it("opens the microphone and the speaker with ORKEON_CODE_VOICE=1: the voice extra, WHISPER_MICROPHONE and WHISPER_SPEAKER", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { ORKEON_CODE_VOICE: "1" });

    // Act
    const on = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(on.status, 0, on.stderr);
    strictEqual(on.env.get("WHISPER_MICROPHONE"), "1");
    strictEqual(on.env.get("WHISPER_SPEAKER"), "1");
    deepStrictEqual(whisperArgs(on, upTo(8)), serverArgs(on.root, ["voice", "tts"]));
    ok(on.stdout.includes(", microphone and speaker on)"), on.stdout);
  });

  it("with the microphone on and another speech backend, adds the openai extra and no tts", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { ORKEON_CODE_VOICE: "1", TTS_BACKEND: "http" });

    // Act
    const http = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    deepStrictEqual(whisperArgs(http, [3, 4, 5, 6, 7]),
      ["--extra", "voice", "--extra", "openai", join(http.root, "mcp/whisper/whisper_mcp.py")], "the openai extra, no tts, for another backend");
  });

  it("adds the cuda extra on WHISPER_DEVICE=cuda, after the voice extra", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { ORKEON_CODE_VOICE: "1", WHISPER_DEVICE: "cuda" });

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(whisperArgs(r, upTo(10)), serverArgs(r.root, ["voice", "tts", "cuda"]));
    ok(r.stdout.includes(" on the GPU, microphone and speaker on)"), r.stdout);
  });

  it("adds the openai extra once when transcription or speech goes through OpenAI's API or a compatible server", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { WHISPER_BACKEND: "openai", TTS_BACKEND: "http" });

    // Act
    const both = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(both.status, 0, both.stderr);
    deepStrictEqual(whisperArgs(both, upTo(7)), [...serverArgs(both.root, ["openai"]), undefined]);
  });

  it("reads the backends and the device as the server does, case and spaces aside", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { TTS_BACKEND: " OpenAI", WHISPER_DEVICE: "CUDA" });

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(whisperArgs(r, [3, 4, 5, 6, 7]), ["--extra", "openai", "--extra", "cuda", join(r.root, "mcp/whisper/whisper_mcp.py")]);
  });

  it("names the whisper-1 model when transcription goes through OpenAI", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { WHISPER_BACKEND: "openai" });

    // Act
    const openai = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    ok(openai.stdout.includes(", model whisper-1)"), openai.stdout);
  });

  it("changes nothing when the variable is not set", () => {
    // Arrange
    const env = ESBUILD;

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(whisperEnv(r), []);
    deepStrictEqual(mountRoots(r.args), ROOTS);
    ok(!r.stdout.includes("audio"), r.stdout);
  });

  it("starts without the server, and says why, when uv is missing", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"));

    // Act
    const noUv = launch({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env });

    // Assert
    strictEqual(noUv.status, 0, noUv.stderr);
    ok(noUv.stderr.includes("uv is not on PATH: speech-to-text is off"), noUv.stderr);
    deepStrictEqual([whisperEnv(noUv), mountRoots(noUv.args)], [[], ROOTS]);
  });

  it("starts without the server, and says why, when a settings file declares one", () => {
    // Arrange
    const settings = { Llm: { Model: "m" }, MCP: { Servers: { whisper: { Command: "/opt/uv" } } } };

    // Act
    const declared = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env: audioEnv(scratchDir("orkeon-code-audio-")), settings });

    // Assert
    strictEqual(declared.status, 0, declared.stderr);
    ok(declared.stderr.includes('declares a "whisper" MCP server: ORKEON_CODE_AUDIO_DIR is ignored'), declared.stderr);
    deepStrictEqual([whisperEnv(declared), mountRoots(declared.args)], [[], ROOTS]);
  });

  it("reads the server's name in a settings file case aside, as the runtime does", () => {
    // Arrange
    const settings = { Llm: { Model: "m" }, MCP: { Servers: { Whisper: { Command: "/opt/uv" } } } };

    // Act
    const anyCase = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env: audioEnv(scratchDir("orkeon-code-audio-")), settings });

    // Assert
    ok(anyCase.stderr.includes('declares a "whisper" MCP server'), "the runtime reads the name case aside: " + anyCase.stderr);
    deepStrictEqual(whisperEnv(anyCase), []);
  });

  it("leaves a server the environment declares as it was, and says why", () => {
    // Arrange
    const env = audioEnv(scratchDir("orkeon-code-audio-"), { [`${WHISPER}Url`]: "http://host.docker.internal:8765/mcp" });

    // Act
    const inEnv = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(inEnv.status, 0, inEnv.stderr);
    ok(inEnv.stderr.includes('the environment declares a "whisper" MCP server (ORKEON_MCP__Servers__whisper__*)'), inEnv.stderr);
    deepStrictEqual([whisperEnv(inEnv), mountRoots(inEnv.args)], [[`${WHISPER}Url`], ROOTS], "left as it was");
  });

  it("stops on a folder that does not exist", () => {
    // Arrange
    const env = audioEnv("/nonexistent/audio");

    // Act
    const r = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(r.status, 1);
    ok(r.stderr.includes("ORKEON_CODE_AUDIO_DIR=/nonexistent/audio is not a folder."), r.stderr);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("is ignored in docker mode, where a Stdio server would run inside the container", () => {
    // Arrange
    const env = { ORKEON_CODE_AUDIO_DIR: scratchDir("orkeon-code-audio-") };

    // Act
    const r = launch({ args: ["--mode", "docker"], bin: { docker: recorder(), uv: "#!/bin/sh\n" }, env });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.stderr.includes("ORKEON_CODE_AUDIO_DIR is ignored in docker mode"), r.stderr);
    ok(!r.args.some((a) => a.includes("/audio") || a.includes("whisper")), r.args.join(" "));
  });
});

// ── The user settings (LI-6) ────────────────────────────────────────────────
// The scripts read no settings and no environment (V-04): the launcher hands them the orkeonCode block of the
// settings file as <state>/user-config/config.json, mounted read-only on /user-config, in every mode.

describe("orkeon-code, the user settings on /user-config", () => {
  for (const mode of ["tool", "source", "docker"] as const) {
    it(`${mode} mode mounts the folder read-only and the file holds the orkeonCode block alone`, () => {
      // Arrange
      const { bin, env } = modeStart(mode);

      // Act
      const r = launchWithNode({ args: ["--mode", mode], bin, env, settings: SETTINGS_WITH_BLOCK });

      // Assert
      strictEqual(r.status, 0, r.stderr);
      const host = mode === "docker" ? "/work/state/user-config" : `${r.state}/user-config`;
      ok(r.args.join("\n").includes(`--mount\n${host}:/user-config:ro`), r.args.join(" "));
      const text = readFileSync(userFile(r), "utf-8");
      deepStrictEqual(JSON.parse(text), BLOCK);
      assertLacks(text, ["Llm", "never-copied"], text);
    });
  }

  it("writes an empty block as it is", () => {
    // Arrange
    const settings = { ...SETTINGS_WITH_BLOCK, orkeonCode: {} };

    // Act
    const empty = launchWithNode({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: ESBUILD, settings });

    // Assert
    strictEqual(empty.status, 0, empty.stderr);
    deepStrictEqual(JSON.parse(readFileSync(userFile(empty), "utf-8")), {});
  });

  for (const c of NO_FILE_SETTINGS) {
    it(`writes no file for ${c.name}`, () => {
      // Arrange
      const settings = c.settings;

      // Act
      const r = launchWithNode({ args: ["--mode", "tool"], bin: { "orkeon-repl": recorder() }, env: ESBUILD, settings });

      // Assert
      strictEqual(r.status, 0, r.stderr);
      ok(!existsSync(userFile(r)), JSON.stringify(settings));
    });
  }

  it("warns, and still starts, when the settings file cannot be parsed", () => {
    // Arrange
    const files = { "broken.json": '{ "Llm": {}, "orkeonCode": ' };

    // Act
    const r = launchWithNode({ args: ["--mode", "tool", "--settings", "broken.json"], bin: { "orkeon-repl": recorder() }, env: ESBUILD, files });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    assertSays(r.stderr, ["the orkeonCode block of", "could not be read: no user setting applies."]);
    ok(!existsSync(userFile(r)));
  });

  it("leaves the folder empty, and still mounts it, when the settings have no block", () => {
    // Arrange
    const tool = { "orkeon-repl": recorder() };

    // Act
    const none = launchWithNode({ args: ["--mode", "tool"], bin: tool, env: ESBUILD });

    // Assert
    strictEqual(none.status, 0, none.stderr);
    ok(!existsSync(userFile(none)), "no block, no file");
    strictEqual(none.stderr.includes("orkeonCode"), false, none.stderr);
    ok(mountRoots(none.args).includes("/user-config"), none.args.join(" "));
  });

  it("never lets a file from an earlier start outlive a block taken out of the settings", () => {
    // Arrange
    const tool = { "orkeon-repl": recorder() };
    const none = launchWithNode({ args: ["--mode", "tool"], bin: tool, env: ESBUILD });
    mkdirSync(join(none.state, "user-config"), { recursive: true });
    writeFileSync(userFile(none), JSON.stringify(BLOCK));

    // Act
    const again = launchWithNode({ args: ["--mode", "tool"], bin: tool, env: { ...ESBUILD, ORKEON_CODE_STATE: none.state } });

    // Assert
    strictEqual(again.status, 0, again.stderr);
    ok(!existsSync(userFile(none)), "the stale file is gone");
  });
});

// ── A clone or an install ───────────────────────────────────────────────────
// A `.git` beside the launcher is a clone: today's behaviour. Without it the launcher runs from an install (an
// archive under ~/.local/lib/orkeon-code, or an npm prefix), whose folder it never writes to: its state, and the
// demo repository, go under ORKEON_CODE_HOME (~/.orkeon-code).

describe("orkeon-code, a clone or an install", () => {
  it("--version names Code's version, where a clone runs from and the Orkeon expected, with nothing configured", () => {
    // Arrange
    const start = { args: ["--version"], bin: {}, bare: true };

    // Act
    const clone = launch(start);

    // Assert
    strictEqual(clone.status, 0, clone.stderr);
    const [first, second] = clone.stdout.split("\n");
    strictEqual(first, `orkeon-code ${CODE_VERSION} (clone: ${clone.root})`);
    ok(second.startsWith(`Orkeon ${RUNTIME_PIN} expected, found: `), second);
  });

  it("--version names an install and where it runs from", () => {
    // Arrange
    const start = { args: ["--version"], bin: {}, bare: true, install: true };

    // Act
    const install = launch(start);

    // Assert
    strictEqual(install.status, 0, install.stderr);
    strictEqual(install.stdout.split("\n")[0], `orkeon-code ${CODE_VERSION} (install: ${install.root})`);
  });

  it("--version names an unpacked source archive a clone: no .git, but its tests", () => {
    // Arrange
    const start = { args: ["--version"], bin: {}, bare: true, install: true, files: { "checkout/tests/a.test.ts": "" } };

    // Act
    const source = launch(start);

    // Assert
    strictEqual(source.stdout.split("\n")[0], `orkeon-code ${CODE_VERSION} (clone: ${source.root})`);
  });

  it("--version reads the version of an Orkeon archive install beside orkeon-repl, and never starts the REPL", () => {
    // Arrange
    const start = { args: ["--version"], bin: TOOL_REPL, bare: true, files: ARCHIVE_VERSION };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.stdout.split("\n")[1], `Orkeon ${RUNTIME_PIN} expected, found: 1.0.0-rc.6 (orkeon-repl, ${join(r.root, "..", "VERSION")})`);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("--version names the source checkout when the mode is forced to source, whatever else is installed", () => {
    // Arrange
    const source = orkeonCheckout();
    const start = { args: ["--mode", "source", "--version"], bin: TOOL_REPL, bare: true, env: { ORKEON_SOURCE: source } };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.stdout.split("\n")[1], `Orkeon ${RUNTIME_PIN} expected, found: source checkout ${source}`);
  });

  it("a clone keeps its state in .crew-output and reads config/appsettings.local.json first", () => {
    // Arrange
    const files = { "checkout/config/appsettings.local.json": SETTINGS_TEXT };

    // Act
    const r = launch({ ...TOOL_START, bare: true, files });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(mountOf(r, "/output"), `${join(r.root, ".crew-output")}/output:/output:rw`);
    ok(r.args.includes(join(r.root, "config/appsettings.local.json")), r.args.join(" "));
    strictEqual(r.cwd, r.project);
  });

  it("an install keeps its state under ~/.orkeon-code, never beside the launcher", () => {
    // Arrange
    const start = { ...TOOL_START, bare: true, install: true, files: USER_SETTINGS };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    const own = join(r.root, "..", ".orkeon-code", "projects", slugOf(r.project));
    strictEqual(mountOf(r, "/output"), `${own}/output:/output:rw`);
    strictEqual(mountOf(r, "/tmp"), `${own}/tmp:/tmp:rw`);
    strictEqual(mountOf(r, "/sessions"), `${own}/sessions:/sessions:rw`);
    ok(!existsSync(join(r.root, ".crew-output")), "nothing written beside the launcher");
  });

  it("an install keeps its state under ORKEON_CODE_HOME when it is set", () => {
    // Arrange
    const other = scratchDir("orkeon-code-home-");

    // Act
    const h = launch({ ...TOOL_START, env: { ...ESBUILD, ORKEON_CODE_HOME: other }, bare: true, install: true, files: USER_SETTINGS });

    // Assert
    strictEqual(h.status, 0, h.stderr);
    strictEqual(mountOf(h, "/output"), `${other}/projects/${slugOf(h.project)}/output:/output:rw`);
  });

  it("an install never reads a config/appsettings.local.json beside it, and says where the settings go", () => {
    // Arrange
    const files = { "checkout/config/appsettings.local.json": SETTINGS_TEXT };

    // Act
    const r = launch({ ...TOOL_START, bare: true, install: true, files });

    // Assert
    strictEqual(r.status, 1);
    assertSays(r.stderr, [
      "no settings file. Run 'orkeon-code setup' in a terminal", join(r.root, "..", ".orkeon-code/appsettings.json"),
      join(r.root, "config/appsettings.example.json"),
    ]);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("--demo seeds the sample repository under the checkout for a clone", () => {
    // Arrange
    const start = { args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, files: USER_SETTINGS };

    // Act
    const clone = launch(start);

    // Assert
    strictEqual(clone.status, 0, clone.stderr);
    strictEqual(clone.cwd, join(clone.root, "fixtures/sample-repo"));
  });

  it("--demo seeds the sample repository under ~/.orkeon-code/demo for an install", () => {
    // Arrange
    const start = { args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, install: true, files: USER_SETTINGS };

    // Act
    const install = launch(start);

    // Assert
    strictEqual(install.status, 0, install.stderr);
    strictEqual(install.cwd, join(install.root, "..", ".orkeon-code/demo/sample-repo"));
    ok(existsSync(join(install.cwd, ".git")), "the demo repository has its history");
    ok(!existsSync(join(install.root, "fixtures")), "nothing written beside the launcher");
  });

  it("an install without esbuild names the Orkeon package or archive, not npm ci", () => {
    // Arrange
    const start = { args: ["--mode", "tool"], bin: TOOL_REPL, install: true };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    ok(r.stderr.includes("esbuild not found: install Orkeon from its package or archive"), r.stderr);
    ok(!r.stderr.includes("npm ci"), r.stderr);
  });
});

describe("orkeon-code.ps1 follows the same rules (read here; run below, where pwsh is installed)", () => {
  it("tells a clone from an install, and keeps an install's state under ORKEON_CODE_HOME", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_CLONE_OR_INSTALL);
  });

  it("prints the same --version lines before reading any settings", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_VERSION_LINES);
    assertBefore(script, "if ($Version", "$Settings = (Resolve-Path $Settings).Path", "before the settings");
  });

  it("runs the REPL from the project with external mounts allowed, no common parent", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_FROM_PROJECT);
    ok(!script.includes("$common"), "the GAP-49 common-parent workaround is gone");
  });

  it("leaves MaxScripts to Orkeon's default and forces no platform", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    ok(!script.includes("MaxScripts"), "orkeon-code.ps1 must not set MaxScripts");
    ok(!script.includes("--platform"), "orkeon-code.ps1 must not force a platform");
  });

  it("trusts a launcher script that sets ORKEON_ESBUILD_PATH (the Debian package's)", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    ok(script.includes("-Pattern 'ORKEON_ESBUILD_PATH' -SimpleMatch -Quiet"), "orkeon-code.ps1 must detect the wrapper");
  });

  it("turns speech-to-text on as ./orkeon-code does: two read-only mounts, the server declared, ignored in docker", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SPEECH);
  });

  it("hands the user settings over as ./orkeon-code does: the orkeonCode block alone, read-only on /user-config", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_USER_SETTINGS);
  });

  it("keeps a one-word ORKEON_REPL argument an array (an if statement would unroll it into characters)", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    ok(script.includes("$rest = @($repl | Select-Object -Skip 1)"), "orkeon-code.ps1 must build $rest as an array");
  });

  it("passes -t to docker only on a terminal, and --user on Linux, as ./orkeon-code", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_DOCKER_TTY);
    ok(!script.includes("docker run --rm -it"), "never -it whatever the input");
  });

  it("refuses a mode it does not have, from the environment too, and answers --help and --demo", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_MODES);
  });

  it("puts back every variable it sets, so none stays in the calling session", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);
    const set = variablesSet(script);
    const most = mostWhisperArgs(script);
    const saved = variablesSaved(script);

    // Assert
    deepStrictEqual(set, PS1_SET_VARIABLES);
    // The server's arguments are set in a loop, by name: Args__0 to Args__12 at most.
    ok(script.includes(PS1_ARGS_LOOP), "the loop");
    strictEqual(most, 13);
    ok(saved !== null, "orkeon-code.ps1 must save the variables before it sets them");
    deepStrictEqual(saved, [...set, ...whisperArgNames(most)].sort());
    assertBefore(script, "$savedEnv[$name] =", "$env:ORKEON_Llm__Model =", "saved before the first is set");
    ok(RESTORED_IN_FINALLY.test(script), "orkeon-code.ps1 must restore them in a finally that closes the script, removing those that were not set");
  });
});

describe("orkeon-code.ps1, run where pwsh is installed", { skip: PWSH ? false : "pwsh is not on PATH" }, () => {
  it("hands the github token variables to the container as ./orkeon-code does, none when none is exported (Orkeon #222)", () => {
    // Arrange
    const env = { GITHUB_TOKEN: "ghp_x", Orkeon__Tools__GitHub__TokenVariable: "MY_GH", MY_GH: "ghp_z" };

    // Act
    const [withToken, without] = [
      launch({ shell: "pwsh", args: ["-Mode", "docker"], bin: { docker: recorder() }, env }),
      launch({ shell: "pwsh", args: ["-Mode", "docker"], bin: { docker: recorder() } }),
    ];

    // Assert
    deepStrictEqual(
      [tokenVarsForwarded(withToken.args), tokenVarsForwarded(without.args)],
      [["GITHUB_TOKEN", "Orkeon__Tools__GitHub__TokenVariable", "MY_GH"], []],
    );
  });

  it("writes the orkeonCode block alone to the read-only /user-config mount, as ./orkeon-code does", () => {
    // Arrange
    const settings = { Llm: { Model: "m", BaseUrl: "http://127.0.0.1:9/v1" }, orkeonCode: { "tools.extra": "search_issues:read" } };

    // Act
    const r = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: SPEECH_TOOL, env: ESBUILD, settings });

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(r.args.includes(`${r.state}/user-config:/user-config:ro`), r.args.join(" "));
    deepStrictEqual(JSON.parse(readFileSync(join(r.state, "user-config", "config.json"), "utf-8")), settings.orkeonCode);
  });

  for (const flag of ["--version", "-Version"]) {
    it(`prints ${flag} as ./orkeon-code does, with nothing configured, and starts nothing`, () => {
      // Arrange
      const start = { shell: "pwsh" as const, args: [flag], bin: SPEECH_TOOL, bare: true, install: true, files: ARCHIVE_VERSION };

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stderr + r.stdout);
      const lines = r.stdout.split("\n");
      strictEqual(lines[0], `orkeon-code ${CODE_VERSION} (install: ${r.root})`);
      strictEqual(lines[1], `Orkeon ${RUNTIME_PIN} expected, found: 1.0.0-rc.6 (orkeon-repl, ${join(r.root, "..", "VERSION")})`);
      strictEqual(r.cwd, "", "the REPL did not start");
    });
  }

  it("starts the REPL found on PATH, from the project", () => {
    // Arrange
    const env = ESBUILD;

    // Act
    const r = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    strictEqual(r.cwd, r.project);
  });

  it("starts the REPL named by a one-word ORKEON_REPL", () => {
    // Arrange
    const env = { ...ESBUILD, ORKEON_REPL: "orkeon-repl" };

    // Act
    const named = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: SPEECH_TOOL, env });

    // Assert
    strictEqual(named.status, 0, named.stderr + named.stdout);
  });

  for (const c of SERVER_CASES) {
    it(`declares the server as ./orkeon-code does: ${c.name}`, () => {
      // Arrange
      const env = audioEnv(scratchDir("orkeon-code-audio-"), c.extra);
      const bash = launch({ args: ["--mode", "tool"], bin: SPEECH_TOOL, env });

      // Act
      const pwsh = launch({ shell: "pwsh", args: ["-Mode", "tool"], bin: SPEECH_TOOL, env });

      // Assert
      strictEqual(pwsh.status, 0, pwsh.stderr + pwsh.stdout);
      deepStrictEqual(serverOf(pwsh), serverOf(bash), JSON.stringify(c.extra));
      deepStrictEqual(mountRoots(pwsh.args), mountRoots(bash.args));
    });
  }

  for (const c of SERVER_LEFT_OUT) {
    it(`leaves the server out for the reason ./orkeon-code does, in the same words: ${c.name}`, () => {
      // Arrange
      const opts = c.opts(audioEnv(scratchDir("orkeon-code-audio-")));
      const bash = launch({ ...opts, args: ["--mode", c.mode] });

      // Act
      const pwsh = launch({ ...opts, shell: "pwsh", args: ["-Mode", c.mode] });

      // Assert
      strictEqual(pwsh.status, 0, `${c.name}: ${pwsh.stderr}${pwsh.stdout}`);
      ok(bash.stderr.includes(c.said), `${c.name}: ${bash.stderr} / ${pwsh.stderr}${pwsh.stdout}`);
      // Write-Warning goes to PowerShell's warning stream, which pwsh -File prints on stdout.
      ok((pwsh.stderr + pwsh.stdout).includes(c.said), `${c.name}: ${bash.stderr} / ${pwsh.stderr}${pwsh.stdout}`);
      deepStrictEqual(serverOf(pwsh), serverOf(bash), c.name);
      deepStrictEqual(mountRoots(pwsh.args), mountRoots(bash.args), c.name);
    });
  }

  it("puts back what it set: a variable that was not set is removed, one that was keeps its value", () => {
    // Arrange
    const names = RESTORED_NAMES;

    // Act
    const restored = runPs1ThenPrint(names);

    // Assert
    strictEqual(restored.status, 0, restored.stderr);
    deepStrictEqual(restored.stdout.trim().split("\n"), names.map((n) => (n === "WHISPER_SPEAKER" ? `${n}=True=kept` : `${n}=False=`)));
  });
});

// ── Folder trust (LI-3) ─────────────────────────────────────────────────────
// The first start in a folder asks, before anything of it is read or mounted; `y` stores it in
// <ORKEON_CODE_HOME>/trusted-folders.json and every folder below it starts silently. Without a terminal an
// untrusted folder is refused (exit 3) unless --trust, or ORKEON_CODE_TRUST=1 with CI=true; neither stores anything.

describe("orkeon-code, folder trust", () => {
  it("refuses an untrusted folder without a terminal: exit 3, --trust named, nothing started", () => {
    // Arrange
    const start = { ...TOOL_START, trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 3, r.stderr);
    assertSays(r.stderr, [`${r.project} is not a trusted folder`, "--trust", `orkeon-code trust add ${r.project}`]);
    strictEqual(r.cwd, "", "the REPL did not start");
    ok(!existsSync(join(r.state, "output")), "no state folder made");
  });

  it("--trust starts this run and stores nothing", () => {
    // Arrange
    const start = { ...TOOL_START, args: ["--mode", "tool", "--trust"], trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, r.project);
    ok(!r.args.includes("--trust"), "not forwarded to the REPL");
    ok(!existsSync(storeOf(r)), "nothing stored");
  });

  it("refuses ORKEON_CODE_TRUST=1 without CI=true", () => {
    // Arrange
    const env = { ...ESBUILD, ORKEON_CODE_TRUST: "1" };

    // Act
    const alone = launch({ ...TOOL_START, env, trusted: false });

    // Assert
    strictEqual(alone.status, 3, alone.stderr);
  });

  it("honours ORKEON_CODE_TRUST=1 with CI=true, and stores nothing", () => {
    // Arrange
    const env = { ...ESBUILD, ORKEON_CODE_TRUST: "1", CI: "true" };

    // Act
    const ci = launch({ ...TOOL_START, env, trusted: false });

    // Assert
    strictEqual(ci.status, 0, ci.stderr);
    ok(!existsSync(storeOf(ci)), "nothing stored");
  });

  it("refuses ORKEON_CODE_TRUST=1 when CI is not exactly true", () => {
    // Arrange
    const env = { ...ESBUILD, ORKEON_CODE_TRUST: "1", CI: "1" };

    // Act
    const other = launch({ ...TOOL_START, env, trusted: false });

    // Assert
    strictEqual(other.status, 3, "CI must be exactly true");
  });

  it("starts silently in a folder below a trusted one", () => {
    // Arrange
    const { nested, home } = nestedTrust();

    // Act
    const t = launch(untrustedStart(home, join(nested, "deep/er")));

    // Assert
    strictEqual(t.status, 0, t.stderr);
    strictEqual(t.cwd, join(nested, "deep/er"));
    ok(!t.stderr.includes("trust"), t.stderr);
  });

  it("refuses a sibling whose name starts like the trusted folder: it is not below it", () => {
    // Arrange
    const { nested, home } = nestedTrust();
    const sibling = scratchFolder(`${nested}-other`);

    // Act
    const u = launch(untrustedStart(home, sibling));

    // Assert
    strictEqual(u.status, 3, u.stderr);
  });

  it("checks a symlinked folder as its target, and mounts the target", () => {
    // Arrange
    const { real, link, home } = linkedFolder();

    // Act
    const r = launch(untrustedStart(home, link));

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(mountOf(r, WORKSPACE), `${real}:${WORKSPACE}:rw`);
  });

  it("does not take a trusted link's own name for the folder", () => {
    // Arrange
    const { link, home } = linkedFolder(true);

    // Act
    const s = launch(untrustedStart(home, link));

    // Assert
    strictEqual(s.status, 3, "the link's own name is not the folder");
  });

  for (const c of CORRUPT_STORES) {
    it(`refuses a corrupt store, ${c.name}, and names it`, () => {
      // Arrange
      const home = corruptHome(c.text);

      // Act
      const r = launch(untrustedStart(home));

      // Assert
      strictEqual(r.status, 1, r.stderr);
      ok(r.stderr.includes(`${join(home, "trusted-folders.json")} is not a trust store this launcher wrote`), r.stderr);
      strictEqual(r.cwd, "", "the REPL did not start");
    });

    it(`trust add refuses a corrupt store, ${c.name}, and keeps it as it was`, () => {
      // Arrange
      const home = corruptHome(c.text);
      const r = launch(untrustedStart(home));

      // Act
      const add = trustOf(r, home, "add", r.project);

      // Assert
      strictEqual(add.status, 1, add.stderr);
      strictEqual(readFileSync(join(home, "trusted-folders.json"), "utf-8"), c.text, "kept as it was");
    });
  }

  it("--demo trusts its own fixture", () => {
    // Arrange
    const start = { args: ["--demo", "--mode", "tool"], bin: TOOL_REPL, env: ESBUILD, bare: true, files: USER_SETTINGS, trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.cwd, join(r.root, "fixtures/sample-repo"));
    ok(!existsSync(storeOf(r)), "nothing stored");
  });

  it("docker mode checks on the host, before docker runs", () => {
    // Arrange
    const start = { args: ["--mode", "docker"], bin: { docker: recorder() }, trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 3, r.stderr);
    strictEqual(r.cwd, "", "docker did not run");
  });

  describe("trust add, list and remove keep the store in the launchers' layout, valid JSON whatever the path", () => {
    it("trust list shows an absent store as empty", () => {
      // Arrange
      const t = trustCli();

      // Act
      const list = t.trust("list");

      // Assert
      strictEqual(list.stdout, "", "an absent store is empty");
    });

    it("trust add stores a folder whose name JSON must escape", () => {
      // Arrange
      const t = trustCli();

      // Act
      const add = t.trust("add", t.odd);

      // Assert
      strictEqual(add.status, 0);
      deepStrictEqual(t.stored(), [t.odd]);
    });

    it("trust add appends a folder after those stored, in the launchers' layout, mode 600", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);

      // Act
      const add = t.trust("add", t.plain);

      // Assert
      strictEqual(add.status, 0);
      const store = t.store();
      strictEqual(store.version, 1);
      deepStrictEqual(store.folders.map((f: { path: string }) => f.path), [t.odd, t.plain]);
      assertTrustedAtDates(store.folders);
      strictEqual(statSync(t.storePath).mode & 0o777, 0o600);
    });

    it("trust add stores a folder once", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);
      t.trust("add", t.plain);

      // Act
      const again = t.trust("add", join(t.plain, "."));

      // Assert
      ok(again.stdout.includes("already trusted"), "a folder is stored once");
      deepStrictEqual(t.stored(), [t.odd, t.plain]);
    });

    it("trust add says a folder below a trusted one is already trusted, through it", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);
      t.trust("add", t.plain);
      t.trust("add", join(t.plain, "."));
      mkdirSync(join(t.plain, "sub"));

      // Act
      const below = t.trust("add", join(t.plain, "sub"));

      // Assert
      ok(below.stdout.includes(`already trusted, through ${t.plain}`), below.stdout);
      const store = t.store();
      strictEqual(store.version, 1);
      deepStrictEqual(store.folders.map((f: { path: string }) => f.path), [t.odd, t.plain]);
      assertTrustedAtDates(store.folders);
      strictEqual(statSync(t.storePath).mode & 0o777, 0o600);
    });

    it("trust list prints the stored folders, one per line", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);
      t.trust("add", t.plain);

      // Act
      const list = t.trust("list");

      // Assert
      deepStrictEqual(list.stdout.split("\n").filter(Boolean).map((l) => l.replace(/ {2}\(trusted .*\)$/, "")), [t.odd, t.plain]);
    });

    it("trust remove refuses a folder trusted through its parent, not in the store", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);
      t.trust("add", t.plain);
      mkdirSync(join(t.plain, "sub"));

      // Act
      const remove = t.trust("remove", join(t.plain, "sub"));

      // Assert
      strictEqual(remove.status, 1, "trusted through its parent, not in the store");
    });

    it("trust remove takes a folder out of the store", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.odd);
      t.trust("add", t.plain);

      // Act
      const remove = t.trust("remove", t.odd);

      // Assert
      strictEqual(remove.status, 0);
      deepStrictEqual(t.stored(), [t.plain]);
    });

    it("trust remove takes out a folder gone, by its stored name", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.plain);
      rmSync(t.plain, { recursive: true });

      // Act
      const remove = t.trust("remove", t.plain);

      // Assert
      strictEqual(remove.status, 0, "a folder gone is removed by its stored name");
      deepStrictEqual(t.store().folders, []);
    });

    it("trust check refuses a folder the store does not hold, with 3", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.plain);

      // Act
      const check = t.trust("check", t.odd);

      // Assert
      strictEqual(check.status, 3);
    });

    it("trust check --trust lets a folder the store does not hold through", () => {
      // Arrange
      const t = trustCli();
      t.trust("add", t.plain);

      // Act
      const check = t.trust("check", t.odd, "--trust");

      // Assert
      strictEqual(check.status, 0);
    });

    it("trust refuses a subcommand it does not have", () => {
      // Arrange
      const t = trustCli();

      // Act
      const unknown = t.trust("frobnicate");

      // Assert
      strictEqual(unknown.status, 1);
    });
  });

  describe("asked in a terminal", { skip: PTY ? false : "util-linux script is not available" }, () => {
    it("n: exit 0, nothing stored, nothing mounted", () => {
      // Arrange
      const start = { ...TOOL_START, trusted: false, tty: "n\n" };

      // Act
      const n = launch(start);

      // Assert
      strictEqual(n.status, 0, n.stdout);
      assertSays(n.stdout, ["do you trust the files in this folder?", n.project, "AGENTS.md", ".orkeon/repo.yaml", "nothing started"]);
      ok(!n.stdout.includes("This trusts every folder below it"), "not $HOME");
      strictEqual(n.cwd, "", "the REPL was never called");
      ok(!existsSync(storeOf(n)), "nothing stored, no state made");
      ok(!existsSync(join(n.state, "output")), "nothing stored, no state made");
    });

    it("no answer is a no", () => {
      // Arrange
      const start = { ...TOOL_START, trusted: false, tty: "" };

      // Act
      const eof = launch(start);

      // Assert
      strictEqual(eof.status, 0, "no answer is a no");
      strictEqual(eof.cwd, "");
    });

    it("y: starts and stores the folder", () => {
      // Arrange
      const start = { ...TOOL_START, trusted: false, tty: "y\n" };

      // Act
      const y = launch(start);

      // Assert
      strictEqual(y.status, 0, y.stdout);
      strictEqual(y.cwd, y.project);
      deepStrictEqual(storedFolders(y), [y.project]);
    });

    it("after y, the next start in the same folder, without a terminal, is silent, through the store", () => {
      // Arrange
      const y = launch({ ...TOOL_START, trusted: false, tty: "y\n" });

      // Act
      const again = startAgain(y);

      // Assert
      strictEqual(again.status, 0, again.stderr);
      ok(!again.stderr.includes("trust"), again.stderr);
      strictEqual(again.cwd, y.project);
    });

    it("says that trusting $HOME trusts every folder below it", () => {
      // Arrange
      // The scratch base is both the launcher's cwd and HOME.
      const start = { ...TOOL_START, args: ["--mode", "tool", "--workspace", "."], trusted: false, tty: "n\n" };

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stdout);
      ok(r.stdout.includes("This trusts every folder below it."), r.stdout);
    });

    it("--trust in a terminal starts without asking", () => {
      // Arrange
      const start = { ...TOOL_START, args: ["--mode", "tool", "--trust"], trusted: false, tty: "" };

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stdout);
      ok(!r.stdout.includes("do you trust"), r.stdout);
      ok(!existsSync(storeOf(r)));
    });
  });
});

describe("the CI's npm-shim step starts the REPL without a terminal", () => {
  it("passes --trust, or the launcher refuses its untrusted folder with 3 before the REPL", () => {
    // Arrange
    const option = " --trust ";

    // Act
    const starts = ciStarts();

    // Assert
    assertEveryLineHolds(starts, option, "the step is there");
  });
});

describe("scripts/run-crew.sh checks the folder as the launcher does", () => {
  it("refuses an untrusted project without a terminal, before dotnet runs", () => {
    // Arrange
    const extra: string[] = [];

    // Act
    const r = runCrew(extra);

    // Assert
    strictEqual(r.status, 3, r.stderr);
    ok(r.stderr.includes("is not a trusted folder"), r.stderr);
    deepStrictEqual(r.calls, []);
  });

  it("runs a trusted project", () => {
    // Arrange
    const extra = ["--inputs", "{}"];

    // Act
    const t = runCrew(extra, { trusted: true });

    // Assert
    strictEqual(t.status, 0, t.stderr);
    ok(t.calls.some((c) => c.includes("tool run orkeon run") && c.includes(`${t.project}:${WORKSPACE}:rw`)), t.calls.join("\n"));
  });

  it("runs an untrusted project with --trust for one run, never forwarded to orkeon run", () => {
    // Arrange
    const extra = ["--trust", "--inputs", "{}"];

    // Act
    const once = runCrew(extra);

    // Assert
    strictEqual(once.status, 0, once.stderr);
    const run = once.calls.find((c) => c.includes("tool run orkeon run")) ?? "";
    ok(run.includes("--inputs {}") && !run.includes("--trust"), run);
  });

  it("passes the settings, the mounts and ORKEON_CODE_MODEL to the tool built from ORKEON_SOURCE in the source mode", () => {
    // Arrange
    const source = crewSource();

    // Act
    const r = runCrew(["--inputs", "{}"], { trusted: true, env: { ORKEON_CODE_MODE: "source", ORKEON_SOURCE: source, ORKEON_CODE_MODEL: "m-live" } });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.calls.some((c) => c.includes(`build ${source}/src/scripting/Orkeon.Scripting.Cli -c Debug`)), r.calls.join("\n"));
    const run = r.calls.find((c) => c.includes(" run --no-build --project ")) ?? "";
    ok(run.includes(`run --no-build --project ${source}/src/scripting/Orkeon.Scripting.Cli -- run ${r.root}/src/crew.ork.ts`), r.calls.join("\n"));
    assertSays(run, [`-s ${r.root}/config/appsettings.local.json`, `-m ${r.project}:${WORKSPACE}:rw`]);
    ok(run.endsWith("--inputs {}"), run);
    ok(r.env.split("\n").includes("ORKEON_Llm__Model=m-live"), r.env);
  });

  it("stops the source mode when ORKEON_SOURCE names no Orkeon checkout, running nothing", () => {
    // Arrange
    const source = crewSource();

    // Act
    const missing = runCrew([], { trusted: true, env: { ORKEON_CODE_MODE: "source", ORKEON_SOURCE: join(source, "nowhere") } });

    // Assert
    strictEqual(missing.status, 1);
    ok(missing.stderr.includes("ORKEON_CODE_MODE=source needs ORKEON_SOURCE"), missing.stderr);
    deepStrictEqual(missing.calls, []);
  });

  it("says the source mode needs dotnet when it is not on PATH, building nothing", { skip: existsSync("/usr/bin/dotnet") || existsSync("/bin/dotnet") }, () => {
    // Arrange
    const source = crewSource();

    // Act
    const r = runCrew([], { trusted: true, noDotnet: true, env: { ORKEON_CODE_MODE: "source", ORKEON_SOURCE: source } });

    // Assert
    strictEqual(r.status, 1, r.stderr);
    ok(r.stderr.includes("needs the .NET SDK: dotnet is not on PATH"), r.stderr);
    deepStrictEqual(r.calls, []);
  });
});

// ── The settings (LI-2) ─────────────────────────────────────────────────────
// First found: --settings, ORKEON_CODE_SETTINGS, config/appsettings.local.json (a clone), ~/.orkeon-code/appsettings.json,
// ~/.config/orkeon-code/appsettings.json (the old place, with a warning), Orkeon's own ~/.config/Orkeon/appsettings.json
// (then no --settings: the REPL reads it itself). None and a terminal: setup.

describe("orkeon-code, where the settings come from", () => {
  it("with Orkeon's own file alone, passes no --settings and still finds the key's variable", () => {
    // Arrange
    const start = { ...TOOL_START, bare: true, install: true, files: RUNTIME_SETTINGS };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(!r.args.includes("--settings"), r.args.join(" "));
    ok(r.stderr.includes("export RUNTIME_KEY"), r.stderr);
    ok(r.stdout.includes(`settings : ${join(r.root, "..", ".config/Orkeon/appsettings.json")} (Orkeon's own, read by the REPL)`), r.stdout);
  });

  it("looks for Orkeon's own file under an absolute XDG_CONFIG_HOME, as the runtime does", () => {
    // Arrange
    const env = { ...ESBUILD, XDG_CONFIG_HOME: "/elsewhere-xdg", RUNTIME_KEY: "set" };

    // Act
    const x = launch({ ...TOOL_START, bare: true, install: true, env, files: RUNTIME_SETTINGS });

    // Assert
    strictEqual(x.status, 1, "an absolute XDG_CONFIG_HOME moves the place, as for the runtime");
  });

  it("docker mode mounts Orkeon's own file and names it: the container has no host HOME", () => {
    // Arrange
    const start = { args: ["--mode", "docker"], bin: { docker: recorder() }, bare: true, install: true, files: RUNTIME_SETTINGS };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.args.includes(`${join(r.root, "..", ".config/Orkeon/appsettings.json")}:/work/settings.json:ro`), r.args.join(" "));
    ok(r.args.join(" ").includes("--settings /work/settings.json"), r.args.join(" "));
  });

  it("reads the old ~/.config/orkeon-code file before Orkeon's own, with a warning", () => {
    // Arrange
    const files = { ...USER_SETTINGS, ...RUNTIME_SETTINGS };

    // Act
    const old = launch({ ...TOOL_START, bare: true, install: true, files });

    // Assert
    strictEqual(old.status, 0, old.stderr);
    const legacy = join(old.root, "..", ".config/orkeon-code/appsettings.json");
    ok(old.args.includes(legacy), old.args.join(" "));
    ok(old.stderr.includes(`${legacy} is the old place of the settings: move it to ${join(old.root, "..", ".orkeon-code/appsettings.json")}`), old.stderr);
  });

  it("reads ~/.orkeon-code/appsettings.json before the old place, without a warning", () => {
    // Arrange
    const files = { ...USER_SETTINGS, ".orkeon-code/appsettings.json": SETTINGS_TEXT };

    // Act
    const home = launch({ ...TOOL_START, bare: true, install: true, files });

    // Assert
    strictEqual(home.status, 0, home.stderr);
    ok(home.args.includes(join(home.root, "..", ".orkeon-code/appsettings.json")), home.args.join(" "));
    ok(!home.stderr.includes("old place"), home.stderr);
  });

  it("reads a clone's config/appsettings.local.json before ~/.orkeon-code/appsettings.json", () => {
    // Arrange
    const files = { "checkout/config/appsettings.local.json": SETTINGS_TEXT, ".orkeon-code/appsettings.json": SETTINGS_TEXT };

    // Act
    const clone = launch({ ...TOOL_START, bare: true, files });

    // Assert
    ok(clone.args.includes(join(clone.root, "config/appsettings.local.json")), "a clone's local file first");
  });

  it("setup refuses to run without a terminal", () => {
    // Arrange
    const start = { args: ["setup"], bin: {}, bare: true, install: true };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 1);
    ok(r.stderr.includes("setup asks its questions in a terminal"), r.stderr);
    ok(!existsSync(join(r.root, "..", ".orkeon-code/appsettings.json")));
  });

  describe("setup, in a terminal", { skip: PTY ? false : "util-linux script is not available" }, () => {
    it("writes ~/.orkeon-code/appsettings.json, mode 600, with the model and the name of the key's variable, never a key", () => {
      // Arrange
      // The first example; a key pasted twice at the model question, then the model; a key pasted twice at the
      // variable question, then the variable.
      const answers = "1\nsk-abcdef0123456789abcdef\nA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\nmy-model\nsk-live-123secret\nA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6\nMY_KEY\n";
      // Keys pasted at the model and at the variable questions: refused, never stored, never said back (the terminal
      // echoes what is typed, once per answer).
      const pasted = [["sk-abcdef0123456789abcdef", 1], ["sk-live-123secret", 1], ["A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6", 2]] as const;

      // Act
      const r = launch({ args: ["setup"], bin: {}, bare: true, install: true, files: EXAMPLE_SETTINGS, tty: answers });

      // Assert
      strictEqual(r.status, 0, r.stdout);
      const text = readFileSync(writtenSettings(r), "utf-8");
      const settings = JSON.parse(text);
      strictEqual(settings.Llm.Model, "my-model");
      strictEqual(settings.Llm.ApiKeyEnvVar, "MY_KEY");
      strictEqual(settings.Llm.BaseUrl, "https://api.deepseek.com");
      assertKeysNotKept(text, r.stdout, pasted);
      assertSays(r.stdout, ["not a model id", "not a variable name", "export MY_KEY=<your key>"]);
      strictEqual(statSync(writtenSettings(r)).mode & 0o777, 0o600);
    });

    it("keeps an existing file unless told to replace it", () => {
      // Arrange
      const answers = "\n";

      // Act
      const kept = launch({ args: ["setup"], bin: {}, bare: true, install: true, files: OLLAMA_AND_EXISTING, tty: answers });

      // Assert
      strictEqual(kept.status, 1, kept.stdout);
      strictEqual(readFileSync(writtenSettings(kept), "utf-8"), "{}");
    });

    it("replaces an existing file when told to, and the Ollama example asks no variable", () => {
      // Arrange
      const answers = "y\n2\n\n";

      // Act
      const replaced = launch({ args: ["setup"], bin: {}, bare: true, install: true, files: OLLAMA_AND_EXISTING, tty: answers });

      // Assert
      strictEqual(replaced.status, 0, replaced.stdout);
      const settings = JSON.parse(readFileSync(writtenSettings(replaced), "utf-8"));
      strictEqual(settings.Llm.Model, "qwen3.5:2b");
      strictEqual(settings.Llm.ApiKeyEnvVar, undefined);
      ok(!replaced.stdout.includes("environment variable that holds the API key ["), replaced.stdout);
    });

    it("runs on a first start with no settings, then starts the REPL with the file written", () => {
      // Arrange
      const answers = "\n\n\n";

      // Act
      const r = launch({ ...TOOL_START, bare: true, install: true, files: EXAMPLE_SETTINGS, tty: answers });

      // Assert
      strictEqual(r.status, 0, r.stdout);
      ok(r.args.includes(writtenSettings(r)), r.args.join(" "));
      strictEqual(r.cwd, r.project);
    });
  });
});

describe("orkeon-code.ps1 checks the folder and finds the settings as ./orkeon-code does (read here)", () => {
  it("binds no argument by position, so trust and setup reach the script", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SUBCOMMANDS);
  });

  it("checks the folder before the settings, refuses without a terminal with exit 3, a decline with 0", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    ok(script.indexOf(PS1_TRUST_CHECK) > 0, "the check");
    assertBefore(script, PS1_TRUST_CHECK, "$runtimeOwn = $false", "before the settings");
    assertMentions(script, PS1_TRUST_REFUSAL);
  });

  it("writes the store in the bash launcher's layout", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_STORE_LAYOUT);
  });

  it("falls back on Orkeon's own file without passing --settings, and warns on the old place", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SETTINGS);
  });
});

describe("orkeon-code.ps1, trust and settings, run where pwsh is installed", { skip: PWSH ? false : "pwsh is not on PATH" }, () => {
  for (const c of CORRUPT_STORES.filter((s) => s.pwsh)) {
    it(`refuses the corrupt store ./orkeon-code refuses, ${c.name}, and keeps it`, () => {
      // Arrange
      const home = corruptHome(c.text);

      // Act
      const r = launch({ shell: "pwsh", ...TOOL_START, args: ["-Mode", "tool"], env: { ...ESBUILD, ORKEON_CODE_HOME: home }, trusted: false });

      // Assert
      strictEqual(r.status, 1, r.stderr + r.stdout);
      strictEqual(readFileSync(join(home, "trusted-folders.json"), "utf-8"), c.text);
    });
  }

  it("refuses an untrusted folder without a terminal", () => {
    // Arrange
    const start = { shell: "pwsh" as const, ...TOOL_START, args: ["-Mode", "tool"], trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 3, r.stderr + r.stdout);
    strictEqual(r.cwd, "");
  });

  it("starts an untrusted folder with --trust, storing nothing", () => {
    // Arrange
    const start = { shell: "pwsh" as const, ...TOOL_START, args: ["-Mode", "tool", "--trust"], trusted: false };

    // Act
    const t = launch(start);

    // Assert
    strictEqual(t.status, 0, t.stderr + t.stdout);
    ok(!existsSync(storeOf(t)));
  });

  it("trust add stores the folder", () => {
    // Arrange
    const start = { shell: "pwsh" as const, args: ["trust", "add", "project"], bin: {}, trusted: false };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
  });

  it("writes a store ./orkeon-code reads", () => {
    // Arrange
    const r = launch({ shell: "pwsh", args: ["trust", "add", "project"], bin: {}, trusted: false });

    // Act
    const check = bashOf(r, "trust", "list");

    // Assert
    strictEqual(check.status, 0, check.stderr);
    ok(check.stdout.startsWith(`${r.project}  (trusted `), check.stdout);
  });

  it("reads back the store it wrote, its dates as strings, and lets the folder start", () => {
    // Arrange
    const r = launch({ shell: "pwsh", args: ["trust", "add", "project"], bin: {}, trusted: false });

    // Act
    const again = pwshOf(r, "trust", "check", r.project);

    // Assert
    strictEqual(again.status, 0, again.stderr + again.stdout);
  });

  it("with Orkeon's own file alone, passes no --settings", () => {
    // Arrange
    const start = { shell: "pwsh" as const, ...TOOL_START, args: ["-Mode", "tool"], bare: true, install: true, files: RUNTIME_SETTINGS };

    // Act
    const r = launch(start);

    // Assert
    strictEqual(r.status, 0, r.stderr + r.stdout);
    ok(!r.args.includes("--settings"), r.args.join(" "));
  });
});

// ── Per-project state (LI-4) and sessions (LI-5) ────────────────────────────
// The runtime saves the session in <SessionsDirectory>/<its slug of the project>/last.json when the REPL ends; the
// launcher points SessionsDirectory at /sessions, a folder of the project's own state outside the project, moves the
// saved file to history/ at the next start unless --continue, and puts a chosen one back on --resume.

describe("the project slug is the runtime's ProjectKey.Slug", () => {
  it("matches the values the runtime computed (dotnet fsi, Orkeon.Infrastructure.dll)", () => {
    // Arrange
    const paths = SLUG_PATHS;

    // Act
    const slugs = paths.map(slugOf);

    // Assert
    deepStrictEqual(slugs, RUNTIME_SLUGS);
  });

  for (const name of PROJECT_NAMES) {
    it(`orkeon-code computes the same for a project named "${name}"`, () => {
      // Arrange
      const start = namedProjectStart(name);

      // Act
      const r = launch(start);

      // Assert
      strictEqual(r.status, 0, r.stderr);
      const workspace = join(r.root, "..", "sub", name);
      strictEqual(mountOf(r, "/sessions"), `${join(r.state, "projects", slugOf(workspace))}/sessions:/sessions:rw`);
    });

    it(`orkeon-code gives two projects named "${name}" two folders`, () => {
      // Arrange
      const first = launch(namedProjectStart(name));

      // Act
      const second = launch(namedProjectStart(name));

      // Assert
      strictEqual(second.status, 0, second.stderr);
      strictEqual(mountOf(second, "/sessions"), `${join(second.state, "projects", slugOf(join(second.root, "..", "sub", name)))}/sessions:/sessions:rw`);
      ok(mountOf(first, "/sessions") !== mountOf(second, "/sessions"), "two paths, two slugs");
    });
  }

  it("orkeon-code.ps1 computes it the same way", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SLUG);
  });
});

describe("orkeon-code, per-project state (LI-4)", () => {
  it("mounts the project's sessions on /sessions and names it to the runtime, persistence on, nothing in the project", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    strictEqual(r.env.get(SESSIONS_DIR), "/sessions");
    strictEqual(r.env.get(PERSIST), "true");
    strictEqual(mountOf(r, "/sessions"), `${s.own}/sessions:/sessions:rw`);
    ok(r.args.includes(`${s.own}/history:/session-history:ro`), r.args.join(" "));
    ok(!existsSync(join(s.project, ".orkeon")), "nothing written in the project");
    ok(r.stdout.includes(`  sessions : ${s.own}/sessions (fresh; --continue brings the last back, --resume lists them)`), r.stdout);
  });

  it("keeps a persistence value the user exported", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const off = s.run([], { [PERSIST]: "false" });

    // Assert
    strictEqual(off.env.get(PERSIST), "false", "a value the user exported is kept");
  });

  it("writes project.json beside the sessions", () => {
    // Arrange
    const s = sessionScene();

    // Act
    s.run([]);

    // Assert
    deepStrictEqual({ ...s.projectJson(), firstSeen: "", lastSeen: "" },
      { path: s.project, slug: slugOf(s.project), runtimeSlug: slugOf(s.project), firstSeen: "", lastSeen: "" });
  });

  it("keeps the first start of project.json at a later start", () => {
    // Arrange
    const s = sessionScene();
    s.run([]);
    writeFileSync(join(s.own, "project.json"), JSON.stringify({ ...s.projectJson(), firstSeen: "2026-01-01T00:00:00Z" }));

    // Act
    s.run([]);

    // Assert
    strictEqual(s.projectJson().firstSeen, "2026-01-01T00:00:00Z");
  });

  it("docker mode mounts the same folders under /work/state, and the runtime's slug is that of /work/project", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const r = s.run(["--mode", "docker"], {}, { docker: recorder() });

    // Assert
    strictEqual(r.status, 0, r.stderr);
    const inner = `/work/state/projects/${slugOf(s.project)}`;
    ok(r.args.includes(`${inner}/sessions:/sessions:rw`) && r.args.includes(`${inner}/history:/session-history:ro`), r.args.join(" "));
    ok(r.args.includes(`${SESSIONS_DIR}=/sessions`) && r.args.includes(`${PERSIST}=true`), r.args.join(" "));
    strictEqual(s.projectJson().runtimeSlug, "project-65d80d2c48b3");
  });

  it("sends a bare --llm-log to the project's state", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const r = s.run(["--", "--llm-log"]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(r.args.slice(-2), ["--llm-log-path", `${s.own}/llm-logs`]);
    ok(!r.args.includes("--llm-log"), r.args.join(" "));
  });

  it("passes an explicit --llm-log-path as given", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const r = s.run(["--", "--llm-log-path", "/tmp/logs"]);

    // Assert
    deepStrictEqual(r.args.slice(-2), ["--llm-log-path", "/tmp/logs"]);
  });

  it("lets an explicit --llm-log-path win over a bare --llm-log", () => {
    // Arrange
    const s = sessionScene();

    // Act
    const both = s.run(["--", "--llm-log-path", "/tmp/logs", "--llm-log"]);

    // Assert
    deepStrictEqual(both.args.slice(-2), ["--llm-log-path", "/tmp/logs"], "the explicit path wins");
    ok(!both.args.includes(`${s.own}/llm-logs`), both.args.join(" "));
  });
});

describe("orkeon-code, sessions (LI-5)", () => {
  it("starts fresh: the last session goes to history/", () => {
    // Arrange
    const s = sessionScene();
    s.save("abc123", "Fix the parser", 2);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0);
    ok(!existsSync(s.last()), "moved away: the runtime starts fresh");
    deepStrictEqual(historyIds(s.history()), ["abc123.json"]);
  });

  it("moves an archive /resume left beside last.json to history/ too, last.json the newest (Orkeon #227)", () => {
    // Arrange
    const s = sessionScene();
    s.save("abc123", "Fix the parser", 2);
    s.archive("20261027T120000Z-archived.json", "zzz999", "Before the switch", 4);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(historyIds(s.history()).sort(), ["abc123.json", "zzz999.json"]);
  });

  it("replaces the history file of a session that went on under its id after /resume loaded it", () => {
    // Arrange
    const s = twoSessions();
    // The REPL archived def456 and loaded abc123 in place, then went on with it: last.json is abc123, longer.
    s.archive("20261027T120000Z-archived.json", "def456", "Second", 1);
    s.save("abc123", "Fix the parser", 3);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    deepStrictEqual(historyIds(s.history()).sort(), ["abc123.json", "def456.json"]);
    ok(s.historyContent("abc123").includes('"m2"'), "the newer abc123 stands");
  });

  it("--continue leaves the last session for the runtime to reload", () => {
    // Arrange
    const s = twoSessions();

    // Act
    const c = s.run(["--continue"]);

    // Assert
    strictEqual(c.status, 0, c.stderr);
    ok(existsSync(s.last()), "left for the runtime");
    ok(c.stdout.includes("(continued)"), c.stdout);
  });

  it("-c leaves it too", () => {
    // Arrange
    const s = twoSessions();
    s.run(["--continue"]);

    // Act
    const c = s.run(["-c"]);

    // Assert
    strictEqual(c.status, 0);
    ok(existsSync(s.last()), "-c too");
    strictEqual(s.history().length, 1);
  });

  it("--resume lists the sessions and, without a terminal, asks for a number or an id", () => {
    // Arrange
    const s = twoSessions();

    // Act
    const r = s.run(["--resume"]);

    // Assert
    strictEqual(r.status, 2);
    ok(/ {2}1 {2}\d{8}T\d{6}Z {2}Second {2}\(1 messages\) {2}def456\n/.test(r.stderr), r.stderr);
    ok(/ {2}2 {2}\d{8}T\d{6}Z {2}Fix the parser {2}\(2 messages\) {2}abc123\n/.test(r.stderr), r.stderr);
    ok(r.stderr.includes("no terminal to choose in: pass --resume <number or id>."), r.stderr);
    strictEqual(r.cwd, "", "the REPL did not start");
  });

  it("--resume <id> puts the chosen one back where the runtime reads it, the open one archived", () => {
    // Arrange
    const s = twoSessions();

    // Act
    const r = s.run(["--resume", "abc"]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.stdout.includes("(resumed abc123)"), r.stdout);
    ok(readFileSync(s.last(), "utf-8").includes('"SessionId":"abc123"'));
    deepStrictEqual(historyIds(s.history()), ["def456.json"], "the open one archived, the chosen one out");
  });

  it("--resume=<n> puts back the session of that number, newest first", () => {
    // Arrange
    const s = twoSessions();
    s.run(["--resume", "abc"]);
    // The REPL resumed abc123 ended on a new session: archived now, it heads the list. Its id sorts after def456's
    // too, so number 1 is ghi789 whether or not this launch falls in a later second than the last one (the
    // history is named <UTC second>-<id> and read newest first: abc123 archived again would head it only when
    // the second changed between the two launches, as under a loaded test run).
    s.save("ghi789", "Third", 3);

    // Act
    const n = s.run(["--resume=1"]);

    // Assert
    strictEqual(n.status, 0, n.stderr);
    ok(readFileSync(s.last(), "utf-8").includes('"SessionId":"ghi789"'));
    ok(n.stdout.includes("(resumed ghi789)"), n.stdout);
  });

  it("--resume refuses a session it does not have", () => {
    // Arrange
    const s = twoSessions();

    // Act
    const unknown = s.run(["--resume", "zzz"]);

    // Assert
    strictEqual(unknown.status, 1);
    ok(unknown.stderr.includes("no saved session 'zzz'"), unknown.stderr);
  });

  it("refuses --continue and --resume together", () => {
    // Arrange
    const s = twoSessions();

    // Act
    const both = s.run(["--continue", "--resume"]);

    // Assert
    strictEqual(both.status, 1);
    ok(both.stderr.includes("--continue and --resume do not go together"), both.stderr);
  });

  it("keeps the 50 newest", () => {
    // Arrange
    const s = fullHistory();

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0);
    strictEqual(s.history().length, 50);
    ok(!s.history().includes("20261001T000000Z-s0.json"), "the oldest went");
  });

  it("keeps the ORKEON_CODE_SESSIONS_KEEP newest", () => {
    // Arrange
    const s = fullHistory();
    s.run([]);

    // Act
    const r = s.run([], { ORKEON_CODE_SESSIONS_KEEP: "2" });

    // Assert
    strictEqual(r.status, 0);
    deepStrictEqual(s.history(), ["20261050T000000Z-s49.json", "20261051T000000Z-s50.json"]);
  });

  it("warns on an ORKEON_CODE_SESSIONS_KEEP that is not a number, and keeps 50", () => {
    // Arrange
    const s = fullHistory();
    s.run([], { ORKEON_CODE_SESSIONS_KEEP: "2" });

    // Act
    const bad = s.run([], { ORKEON_CODE_SESSIONS_KEEP: "lots" });

    // Assert
    ok(bad.stderr.includes("ORKEON_CODE_SESSIONS_KEEP=lots is not a whole number from 1 to 9999: 50 sessions are kept."), bad.stderr);
  });

  for (const keep of KEEP_OUT_OF_RANGE) {
    it(`warns on ORKEON_CODE_SESSIONS_KEEP=${keep}, out of 1 to 9999, and deletes nothing more`, () => {
      // Arrange
      const s = fullHistory();
      s.run([], { ORKEON_CODE_SESSIONS_KEEP: "2" });

      // Act
      const r = s.run([], { ORKEON_CODE_SESSIONS_KEEP: keep });

      // Assert
      strictEqual(r.status, 0, r.stderr);
      ok(r.stderr.includes(`ORKEON_CODE_SESSIONS_KEEP=${keep} is not a whole number from 1 to 9999`), r.stderr);
      strictEqual(s.history().length, 2, `${keep}: nothing more deleted`);
    });
  }

  it("reads ORKEON_CODE_SESSIONS_KEEP=08 as eight, not as octal", () => {
    // Arrange
    const s = fullHistory();
    s.run([], { ORKEON_CODE_SESSIONS_KEEP: "2" });

    // Act
    const octal = s.run([], { ORKEON_CODE_SESSIONS_KEEP: "08" });

    // Assert
    strictEqual(octal.status, 0, octal.stderr);
    strictEqual(s.history().length, 2, "08 is eight");
  });

  it("drops a session without a message rather than archiving it", () => {
    // Arrange
    const s = sessionScene();
    s.save("empty1", "", 0);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0);
    ok(!existsSync(s.last()));
    deepStrictEqual(s.history(), []);
  });

  it("reads a number up to the list's length, else the start of an id", () => {
    // Arrange
    const s = sessionScene();
    s.save("1234ab", "Digits first", 1);
    s.run([]);

    // Act
    const r = s.run(["--resume", "1234"]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.stdout.includes("(resumed 1234ab)"), r.stdout);
  });

  it("leaves the session of another start that still runs where it is, and keeps this one beside it", () => {
    // Arrange
    const s = sessionScene();
    s.save("abc123", "Open elsewhere", 1);
    mkdirSync(s.own, { recursive: true });
    writeFileSync(join(s.own, ".lock"), `${process.pid}\n`);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0, r.stderr);
    ok(r.stderr.includes(`another session is open on this project (pid ${process.pid})`), r.stderr);
    ok(existsSync(s.last()), "not moved");
    const pid = readFileSync(join(s.own, ".lock"), "utf-8").trim().split("\n");
    strictEqual(pid[0], String(process.pid), "the open start stays in the lock");
    strictEqual(pid.length, 2);
    strictEqual(mountOf(r, "/sessions"), `${s.own}/side/${pid[1]}:/sessions:rw`, "this one kept beside it");
  });

  it("refuses --resume while another start runs", () => {
    // Arrange
    const { s } = leftBeside();

    // Act
    const resume = s.run(["--resume", "1"]);

    // Assert
    strictEqual(resume.status, 1);
    ok(resume.stderr.includes("end it before you resume one"), resume.stderr);
    ok(existsSync(s.last()), "still not moved");
  });

  it("archives what the start beside left once the lock is stale, and removes the side folder", () => {
    // Arrange
    // What that second REPL left when it ended: archived by the next start that finds none open.
    const { s, lock } = leftBeside();
    s.run(["--resume", "1"]);
    staleLock(s.own);

    // Act
    const r = s.run([]);

    // Assert
    strictEqual(r.status, 0);
    ok(!existsSync(s.last()), "a stale lock does not hold it");
    ok(s.history().some((f) => f.endsWith("-side1.json")), s.history().join(" "));
    ok(!existsSync(join(s.own, "side", lock[1])), "the side folder went");
  });
});

describe("orkeon-code.ps1 keeps the state and the sessions as ./orkeon-code does (read here)", () => {
  it("mounts /sessions and /session-history and names /sessions to the runtime, in both modes", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SESSION_MOUNTS);
  });

  it("archives unless --continue, resumes by number or id, keeps 50, and steps aside for an open session", () => {
    // Arrange
    const launcher = "orkeon-code.ps1";

    // Act
    const script = read(launcher);

    // Assert
    assertMentions(script, PS1_SESSIONS);
  });
});
