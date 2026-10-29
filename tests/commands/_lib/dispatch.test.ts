// commands/_lib/dispatch.ts: launchCrew, the crew launch every async command goes
// through, over a FakeCrewHost; launchMainLoop, which resolves the mode and the
// extra tools and hands the session's rules to the host gate (a
// FakePermissionRules) before it — down to the turn it starts, for /mode;
// writeCompleted, the line its completion writes. Run:
//   node --test tests/commands/_lib/dispatch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";

import { parseAssistantInput } from "../../../src/commands/_lib/args.ts";
import { launchCrew, launchMainLoop, withLlmProfile, writeCompleted } from "../../../src/commands/_lib/dispatch.ts";
import { BREAKER_RUN_FIELD } from "../../../src/crews/main-loop/application/auto-compact.ts";
import { loadCatalogue, runMainLoop } from "../../../src/crews/main-loop/application/run-main-loop.ts";
import type { MainLoopInputs } from "../../../src/crews/main-loop/application/run-main-loop.ts";
import { chainDepthLine } from "../../../src/shared/domain/agents/chain.ts";
import { exclusiveLine } from "../../../src/shared/domain/agents/exclusive.ts";
import { ruleDecision, toolsetFor } from "../../../src/shared/domain/agent-policy/permission.ts";
import { PERMISSION_MODES } from "../../../src/shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY, PERMISSION_RULES_STATE_KEY } from "../../../src/shared/domain/session-keys.ts";
import { FakeClock } from "../../support/doubles/fake-clock.ts";
import { FakeLlm } from "../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../support/doubles/fake-logger.ts";
import { FakeMemoryStore } from "../../support/doubles/fake-memory-store.ts";
import { FakePermissionRules } from "../../support/doubles/fake-permission-rules.ts";
import { FakeRunState } from "../../support/doubles/fake-run-state.ts";
import { FakeShell } from "../../support/doubles/fake-shell.ts";
import { FakeTelemetry } from "../../support/doubles/fake-telemetry.ts";
import { FakeToolCatalogue } from "../../support/doubles/fake-tool-catalogue.ts";
import {
  CHAIN_LIMIT_ERROR, EXCLUSIVE_ERROR,
  FALLBACK_VIA,
  MCP_EXTRA_TOOLS,
  MCP_REGISTERED,
  MCP_UNREGISTERED_WARNING,
  MEMORY_GATE,
  MEMORY_PATHS,
  MIXED_EXTRA_TOOLS,
  MIXED_EXTRA_TOOLS_WARNINGS,
  NOT_A_PROFILE_WARNING,
  NO_SPEAK_WARNING,
  QUIET_VOICE_CASES,
  START_SCRIPT,
  UNREADABLE_EXTRA_TOOLS_WARNINGS,
  UNREADABLE_VOICE_WARNINGS,
  crewDeps,
  lineSink,
  mainLoopDeps,
  planModeSession,
  profiledCrewDeps,
  unreadableFileConfig,
  unreadableVoiceDeps,
  voiceDeps,
} from "./dispatch.fixtures.ts";
import { assertMemoryGuarded } from "./dispatch.assertions.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("launchCrew", () => {
  it("starts the crew, logs the launch with its ticket and returns the ticket", () => {
    // Arrange
    const { crews, deps, logged } = crewDeps();

    // Act
    const result = launchCrew(deps, "project-init", { cwd: WORKSPACE });

    // Assert
    deepStrictEqual(result, { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{ name: "project-init", input: { cwd: WORKSPACE } }]);
    deepStrictEqual(logged, [{ message: "project-init launched", data: { ticket: "ticket-1" } }]);
  });

  it("hands the crew the profile the deps carry, as llmProfile in its input, and logs it", () => {
    // Arrange
    const { crews, deps, logged } = crewDeps();

    // Act
    launchCrew({ ...deps, llmProfile: "guarded" }, "analyze", { raw: false });

    // Assert
    deepStrictEqual(crews.launches, [{ name: "analyze", input: { raw: false, llmProfile: "guarded" } }]);
    deepStrictEqual(logged, [{ message: "analyze launched", data: { ticket: "ticket-1", llmProfile: "guarded" } }]);
  });

  it("hands the crew no llmProfile when the deps carry none", () => {
    // Arrange
    const { crews, deps } = crewDeps();

    // Act
    launchCrew({ ...deps, llmProfile: null }, "analyze", { raw: false });

    // Assert
    deepStrictEqual(crews.launches, [{ name: "analyze", input: { raw: false } }]);
  });

  it("adds the caller's details to the launch log", () => {
    // Arrange
    const { deps, logged } = crewDeps();

    // Act
    launchCrew(deps, "main-loop", { prompt: "hi" }, { permissionMode: "(session default)", permissionRules: 0 });

    // Assert
    deepStrictEqual(logged, [{
      message: "main-loop launched",
      data: { ticket: "ticket-1", permissionMode: "(session default)", permissionRules: 0 },
    }]);
  });

  it("hands the launch option to the host: a driver relaunching itself keeps the chain's depth (Orkeon #221)", () => {
    // Arrange
    const { crews, deps } = crewDeps();

    // Act
    launchCrew(deps, "dev-implement", { batch: "F2" }, {}, { chain: "continue" });

    // Assert
    deepStrictEqual(crews.launches, [{ name: "dev-implement", input: { batch: "F2" }, options: { chain: "continue" } }]);
  });

  it("turns a hop past the chain's limit into a refusal that says so (V-A5)", () => {
    // Arrange
    const { deps, logged } = crewDeps(CHAIN_LIMIT_ERROR);

    // Act
    const result = launchCrew(deps, "dev-verify", {}, { batch: "b1" });

    // Assert
    const line = chainDepthLine("dev-verify", { depth: 8, limit: 8, command: "dev-batches" });
    deepStrictEqual(result, { refused: line, message: line });
    deepStrictEqual(logged[0].data, { depth: 8, limit: 8, command: "dev-batches", batch: "b1" });
  });

  it("turns a crew the host refuses as already running into a refusal that says so (Orkeon #239)", () => {
    // Arrange
    const { deps, logged } = crewDeps(EXCLUSIVE_ERROR);

    // Act
    const result = launchCrew(deps, "code-review", {}, { lens: "security" }, { exclusive: true });

    // Assert
    const line = exclusiveLine({ crew: "code-review", ticket: "t2" });
    deepStrictEqual(result, { refused: line, message: line });
    deepStrictEqual(logged[0].data, { crew: "code-review", ticket: "t2", lens: "security" });
  });

  it("lets any other launch failure throw", () => {
    // Arrange
    const { deps } = crewDeps("crew not found");

    // Act
    const act = () => launchCrew(deps, "dev-verify");

    // Assert
    throws(act, /crew not found/);
  });
});

describe("withLlmProfile", () => {
  it("reads the session's llm.profile into the deps", async () => {
    // Arrange
    const { deps, config } = profiledCrewDeps("guarded");

    // Act
    const profiled = await withLlmProfile(deps, config);

    // Assert
    deepStrictEqual(profiled, { ...deps, llmProfile: "guarded" });
  });

  it("leaves the deps without a profile when the session names none", async () => {
    // Arrange
    const { deps, config, warned } = profiledCrewDeps();

    // Act
    const profiled = await withLlmProfile(deps, config);

    // Assert
    deepStrictEqual({ profile: profiled.llmProfile, warned }, { profile: null, warned: [] });
  });

  it("warns and leaves the deps without a profile when the value is not a profile name", async () => {
    // Arrange
    const { deps, config, warned } = profiledCrewDeps("a b");

    // Act
    const profiled = await withLlmProfile(deps, config);

    // Assert
    deepStrictEqual({ profile: profiled.llmProfile, warned }, { profile: null, warned: [NOT_A_PROFILE_WARNING] });
  });
});

describe("launchMainLoop", () => {
  it("hands the main loop the session's llm.profile", async () => {
    // Arrange
    const { crews, config, deps } = mainLoopDeps();
    await config.writeSession({ "llm.profile": "guarded" });

    // Act
    await launchMainLoop(deps, { prompt: "fix it", permissionMode: "plan" });

    // Assert
    strictEqual(crews.launches[0].input.llmProfile, "guarded");
  });

  it("hands the main loop no llmProfile when the session names none", async () => {
    // Arrange
    const { crews, deps } = mainLoopDeps();

    // Act
    await launchMainLoop(deps, { prompt: "fix it", permissionMode: "plan" });

    // Assert
    strictEqual("llmProfile" in crews.launches[0].input, false);
  });

  it("keeps the profile the deps already carry, without reading the session's again", async () => {
    // Arrange
    const { crews, config, deps } = mainLoopDeps();
    await config.writeSession({ "llm.profile": "stored" });

    // Act
    await launchMainLoop({ ...deps, llmProfile: "given" }, { prompt: "fix it", permissionMode: "plan" });

    // Assert
    strictEqual(crews.launches[0].input.llmProfile, "given");
  });

  it("launches the main loop on the host's default model, with a warning, when llm.profile is not a profile name", async () => {
    // Arrange
    const { crews, config, warned, deps } = mainLoopDeps();
    await config.writeSession({ "llm.profile": "a b" });

    // Act
    await launchMainLoop(deps, { prompt: "fix it", permissionMode: "plan" });

    // Assert
    deepStrictEqual([warned, "llmProfile" in crews.launches[0].input], [[NOT_A_PROFILE_WARNING], false]);
  });

  it("hands the gate the session's rules BEFORE the crew starts, then the crew its rules and mode", async () => {
    // Arrange
    const { gate, crews, atLaunch, logged, warned, deps } = mainLoopDeps(
      "deny:file_write", "allow shell_command command=npm test*",
    );

    // Act
    const ticket = await launchMainLoop(deps, { prompt: "fix it", permissionMode: null });

    // Assert
    deepStrictEqual(ticket, { ticket: "ticket-1" });
    const handed = ["clear", "add deny file_write", "add allow shell_command command=npm test*", ...MEMORY_GATE];
    deepStrictEqual(atLaunch.gate, handed);
    deepStrictEqual(gate.calls, handed);
    deepStrictEqual(crews.launches, [{
      name: "main-loop",
      input: {
        prompt: "fix it",
        permissionMode: "default",
        permissionModeVia: FALLBACK_VIA,
        permissionRules: ["deny file_write", "allow shell_command command=npm test*"],
        extraTools: [],
      },
    }]);
    deepStrictEqual(logged, [{
      message: "main-loop launched",
      data: { ticket: "ticket-1", permissionMode: "default", permissionRules: 2, extraTools: 0 },
    }]);
    deepStrictEqual(warned, []);
  });

  for (const mode of PERMISSION_MODES) {
    it(`denies every tool of the model a write under the memory's candidates and entries, in mode ${mode}`, async () => {
      // Arrange
      const { gate, atLaunch, deps } = mainLoopDeps("allow file_write");

      // Act
      await launchMainLoop(deps, { prompt: "go", permissionMode: mode });

      // Assert
      deepStrictEqual(atLaunch.gate, ["clear", "add allow file_write", ...MEMORY_GATE], mode);
      assertMemoryGuarded(gate.rules, MEMORY_PATHS, mode);
    });
  }

  it("puts the guard on the memory.dir the settings name", async () => {
    // Arrange
    const { gate, config, deps } = mainLoopDeps();
    await config.writeSession({ "memory.dir": "docs/memory" });

    // Act
    await launchMainLoop(deps, { prompt: "go", permissionMode: "acceptEdits" });

    // Assert
    strictEqual(ruleDecision(gate.rules, "file_write", { path: "docs/memory/entries/decision/x.md" }), "deny");
    strictEqual(ruleDecision(gate.rules, "file_write", { path: ".orkeon/memory/entries/decision/x.md" }), undefined);
  });

  it("forwards the start script's output to the crew, and says how many lines it has", async () => {
    // Arrange
    const { crews, logged, deps } = mainLoopDeps();

    // Act
    await launchMainLoop(deps, { prompt: "hello", permissionMode: null, sessionStart: START_SCRIPT });

    // Assert
    deepStrictEqual(crews.launches[0].input?.sessionStart, START_SCRIPT);
    strictEqual((logged[0].data as { sessionStartLines?: number }).sessionStartLines, 2);
  });

  it("forwards no start script when there is none", async () => {
    // Arrange
    const { crews, deps } = mainLoopDeps();

    // Act
    await launchMainLoop(deps, { prompt: "again", permissionMode: null, sessionStart: null });

    // Assert
    strictEqual("sessionStart" in (crews.launches[0].input ?? {}), false);
  });

  it("resolves the session's mode when the request names none", async () => {
    // Arrange
    const { crews, store, deps } = mainLoopDeps();
    store.state.set(DEFAULT_MODE_STATE_KEY, "acceptEdits");

    // Act
    await launchMainLoop(deps, { prompt: "go", permissionMode: null });

    // Assert
    deepStrictEqual([crews.launches[0].input?.permissionMode, crews.launches[0].input?.permissionModeVia],
      ["acceptEdits", "session default via /mode"]);
  });

  it("passes a named mode as is", async () => {
    // Arrange
    const { crews, store, deps } = mainLoopDeps();
    store.state.set(DEFAULT_MODE_STATE_KEY, "acceptEdits");

    // Act
    await launchMainLoop(deps, { prompt: "look", permissionMode: "plan" });

    // Assert
    deepStrictEqual([crews.launches[0].input?.permissionMode, crews.launches[0].input?.permissionModeVia], ["plan", undefined]);
  });

  it("empties the gate when the session holds no rules", async () => {
    // Arrange
    const { gate, crews, deps } = mainLoopDeps();

    // Act
    await launchMainLoop(deps, { prompt: "summarise", permissionMode: "plan" });

    // Assert
    deepStrictEqual(gate.calls, ["clear", ...MEMORY_GATE]);
    deepStrictEqual(crews.launches[0].input, {
      prompt: "summarise", permissionMode: "plan", permissionRules: [], extraTools: [],
    });
  });

  it("still launches, with a warning, when the host keeps no rules or a stored entry rotted", async () => {
    // Arrange
    const { gate, crews, warned, deps } = mainLoopDeps("deny:file_write", "bogus");
    gate.kept = false;

    // Act
    await launchMainLoop(deps, { prompt: "go", permissionMode: "default" });

    // Assert
    deepStrictEqual(crews.launches[0].input, {
      prompt: "go", permissionMode: "default", permissionRules: ["deny file_write"], extraTools: [],
    });
    deepStrictEqual(warned, [
      "1 stored permission entr(ies) are not rules and were ignored",
      "the host keeps no session rules: the gate decides each call from the mode alone",
    ]);
  });

  it("launches without the extra tools when tools.extra cannot be read, and leaves their rules stored", async () => {
    // Arrange
    const { gate, crews, warned, store, deps } = mainLoopDeps("deny create_issue", "deny file_write");
    const config = unreadableFileConfig(store);

    // Act
    await launchMainLoop({ ...deps, config }, { prompt: "go", permissionMode: "default" });

    // Assert
    deepStrictEqual(crews.launches[0].input, {
      prompt: "go", permissionMode: "default", permissionRules: ["deny file_write"], extraTools: [],
    });
    deepStrictEqual(gate.calls, ["clear", "add deny file_write", ...MEMORY_GATE]);
    deepStrictEqual(warned, UNREADABLE_EXTRA_TOOLS_WARNINGS);
    deepStrictEqual(JSON.parse(store.state.get(PERMISSION_RULES_STATE_KEY)!), ["deny create_issue", "deny file_write"]);
  });

  it("passes the extra tools the host registers, warns once per missing name or refused entry", async () => {
    // Arrange
    const { gate, crews, logged, warned, config, catalogue, deps } = mainLoopDeps(
      "deny gone_tool", "allow search_issues query=bug*", "deny never_configured",
    );
    await config.writeSession({ "tools.extra": MIXED_EXTRA_TOOLS });
    catalogue.tools.set("transcribe_audio", "");
    catalogue.tools.set("search_issues", "");

    // Act
    await launchMainLoop(deps, { prompt: "triage", permissionMode: "default" });

    // Assert
    deepStrictEqual(crews.launches[0].input, {
      prompt: "triage",
      permissionMode: "default",
      // A rule on a configured tool holds, registered or not; one on an unknown tool is dormant.
      permissionRules: ["deny gone_tool", "allow search_issues query=bug*"],
      extraTools: ["transcribe_audio:read", "search_issues:write"],
    });
    deepStrictEqual(gate.calls, ["clear", "add deny gone_tool", "add allow search_issues query=bug*", ...MEMORY_GATE]);
    deepStrictEqual(warned, MIXED_EXTRA_TOOLS_WARNINGS);
    deepStrictEqual(logged[0].data, { ticket: "ticket-1", permissionMode: "default", permissionRules: 2, extraTools: 2 });
  });

  it("hands the crew the names an MCP server registers, kebab, camel or snake, whatever case the setting uses", async () => {
    // Arrange
    const { crews, warned, config, catalogue, deps } = mainLoopDeps();
    await config.writeSession({ "tools.extra": MCP_EXTRA_TOOLS });
    for (const name of MCP_REGISTERED) catalogue.tools.set(name, "");

    // Act
    await launchMainLoop(deps, { prompt: "triage", permissionMode: "default" });

    // Assert
    deepStrictEqual((crews.launches[0].input as MainLoopInputs).extraTools, [
      "get-file-contents:read", "listIssues:write", "search_code:write",
    ]);
    // Another spelling of a registered name is not that tool: act would fail the turn on it.
    deepStrictEqual(warned, [MCP_UNREGISTERED_WARNING]);
  });
});

describe("launchMainLoop — voice.reply", () => {
  it("adds the epilogue that reads the answer aloud, under speak's registered name, when it is on", async () => {
    // Arrange
    const s = await voiceDeps("on", "Speak");

    // Act
    await launchMainLoop(s.deps, { prompt: "hi", permissionMode: "default" });

    // Assert
    deepStrictEqual((s.crews.launches[0].input as MainLoopInputs).epilogue,
      { tool: "Speak", args: {}, textArg: "text", label: "Reply read aloud" });
    deepStrictEqual(s.warned, []);
  });

  for (const c of QUIET_VOICE_CASES) {
    it(c.name, async () => {
      // Arrange
      const s = await voiceDeps(c.value, ...c.registered);

      // Act
      await launchMainLoop(s.deps, { prompt: "hi", permissionMode: "default" });

      // Assert
      strictEqual((s.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    });
  }

  it("adds nothing, and warns, when it is on without speak", async () => {
    // Arrange
    const missing = await voiceDeps("on");

    // Act
    await launchMainLoop(missing.deps, { prompt: "hi", permissionMode: "default" });

    // Assert
    strictEqual((missing.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    deepStrictEqual(missing.warned, [NO_SPEAK_WARNING]);
  });

  it("launches the turn without reading aloud when the setting cannot be read", async () => {
    // Arrange
    const s = await voiceDeps("on", "speak");
    const unreadable = unreadableVoiceDeps(s);

    // Act
    await launchMainLoop(unreadable, { prompt: "hi", permissionMode: "default" });

    // Assert
    strictEqual(s.crews.launches.length, 1, "the turn still runs");
    strictEqual((s.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    deepStrictEqual(s.warned, UNREADABLE_VOICE_WARNINGS);
  });
});

describe("/mode plan, then a request without a mode: prefix", () => {
  it("offers the plan catalogue", async () => {
    // Arrange
    const { crews, config, session } = await planModeSession();
    const { prompt, permissionMode } = parseAssistantInput("explain the cache layer");

    // Act
    await launchMainLoop({
      session, config, catalogue: new FakeToolCatalogue(), crews, gate: new FakePermissionRules(), log: new FakeLogger(),
    }, { prompt, permissionMode });

    // Assert
    const loaded = loadCatalogue(crews.launches[0].input as MainLoopInputs);
    deepStrictEqual(loaded.catalogue.tools, toolsetFor("plan"));
  });

  it("runs the act call in plan", async () => {
    // Arrange
    const { crews, files, config, session } = await planModeSession();
    const { prompt, permissionMode } = parseAssistantInput("explain the cache layer");
    await launchMainLoop({
      session, config, catalogue: new FakeToolCatalogue(), crews, gate: new FakePermissionRules(), log: new FakeLogger(),
    }, { prompt, permissionMode });
    const input = crews.launches[0].input as MainLoopInputs;
    const loaded = loadCatalogue(input);
    const llm = new FakeLlm();
    llm.answers = ["the cache layer, explained"]; // a blank answer would be sent back once (stop chain)
    const log = new FakeLogger();
    const run = new FakeRunState();
    run.fields = { [BREAKER_RUN_FIELD]: 0 };

    // Act
    await runMainLoop(input, loaded, {
      shell: new FakeShell(), session, files, telemetry: new FakeTelemetry(), memory: new FakeMemoryStore(),
      llm, log, run, tools: new FakeToolCatalogue(), clock: new FakeClock().now,
      compact: async () => ({ status: "skipped", reason: "below trigger" }),
    });

    // Assert
    strictEqual(llm.acts[0].request.permissionMode, "plan");
    deepStrictEqual(log.lines, ["info: permission mode 'plan' — session default via /mode"]);
  });
});

describe("writeCompleted", () => {
  it("writes the payload of a success", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: true, payload: "report written" }, "review");

    // Assert
    deepStrictEqual(lines, ["report written"]);
  });

  it("writes the payload of a success after the prefix when there is one", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: true, payload: "abc123" }, "commit", "✓ committed ");

    // Assert
    deepStrictEqual(lines, ["✓ committed abc123"]);
  });

  it("writes nothing for a success the console already streamed (Orkeon #228)", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: true, payload: "the answer", streamed: true }, "assistant");

    // Assert
    deepStrictEqual(lines, []);
  });

  it("writes the failure even when the turn streamed", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: false, error: "no diff", streamed: true }, "review");

    // Assert
    deepStrictEqual(lines, ["✗ review failed: no diff"]);
  });

  it("writes the failure with the label and the error", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: false, error: "no diff" }, "review");

    // Assert
    deepStrictEqual(lines, ["✗ review failed: no diff"]);
  });

  it("writes the failure with the label and 'unknown' when there is no error", () => {
    // Arrange
    const { lines, out } = lineSink();

    // Act
    writeCompleted(out, { success: false }, "analyze", "ignored ");

    // Assert
    deepStrictEqual(lines, ["✗ analyze failed: unknown"]);
  });
});
