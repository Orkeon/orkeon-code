// commands/_lib/dispatch.ts: launchCrew, the crew launch every async command goes
// through, over a FakeCrewHost; launchMainLoop, which resolves the mode and the
// extra tools and hands the session's rules to the host gate (a
// FakePermissionRules) before it — down to the turn it starts, for /mode;
// writeCompleted, the line its completion writes. Run:
//   node --test tests/commands-dispatch.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";

import { parseAssistantInput } from "../src/commands/_lib/args.ts";
import { launchCrew, launchMainLoop, writeCompleted } from "../src/commands/_lib/dispatch.ts";
import type { CrewCompletion } from "../src/commands/_lib/dispatch.ts";
import { runMode } from "../src/commands/_lib/mode.ts";
import { BREAKER_RUN_FIELD } from "../src/crews/main-loop/application/auto-compact.ts";
import { loadCatalogue, runMainLoop } from "../src/crews/main-loop/application/run-main-loop.ts";
import type { MainLoopInputs } from "../src/crews/main-loop/application/run-main-loop.ts";
import { createConfigStore } from "../src/shared/application/config-store.ts";
import { createSessionIo } from "../src/shared/application/session-io.ts";
import { chainDepthLine } from "../src/shared/domain/agents/chain.ts";
import { ruleDecision, toolsetFor } from "../src/shared/domain/agent-policy/permission.ts";
import { PATH_WRITE_TOOLS } from "../src/shared/domain/agent-policy/rule-sets.ts";
import { PERMISSION_MODES } from "../src/shared/domain/permission-modes.ts";
import { resolveFallbackMode } from "../src/shared/domain/permission-modes.ts";
import { DEFAULT_MODE_STATE_KEY, PERMISSION_RULES_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeCrewHost } from "./support/fake-crew-host.ts";
import { FakeFiles } from "./support/fake-files.ts";
import { FakeLlm } from "./support/fake-llm.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeMemoryStore } from "./support/fake-memory-store.ts";
import { FakePermissionRules } from "./support/fake-permission-rules.ts";
import { FakeRunState } from "./support/fake-run-state.ts";
import { FakeSessionStore } from "./support/fake-session-store.ts";
import { FakeShell } from "./support/fake-shell.ts";
import { FakeTelemetry } from "./support/fake-telemetry.ts";
import { FakeToolCatalogue } from "./support/fake-tool-catalogue.ts";
import { DEFAULT_MEMORY_DIR, memoryWriteRules } from "../src/shared/domain/shared-memory/layout.ts";
import { gateLine as memoryGateLine } from "../src/shared/domain/agent-policy/permission.ts";

/** The built-in denies every sync adds after the session's rules: no model tool writes the memory's candidates or entries. */
const MEMORY_LINES = memoryWriteRules(DEFAULT_MEMORY_DIR).map(memoryGateLine);
const MEMORY_GATE = MEMORY_LINES.map((line) => `add ${line}`);

function setup() {
  const crews = new FakeCrewHost();
  const logged: Array<{ message: string; data: unknown }> = [];
  const warned: string[] = [];
  const log = {
    info: (message: string, data?: object) => logged.push({ message, data }),
    warn: (message: string) => warned.push(message),
  };
  return { crews, deps: { crews, log }, log, logged, warned };
}

/** A crew host that notes what the gate held when the crew was launched. */
class GateWatchingCrewHost extends FakeCrewHost {
  gate: FakePermissionRules;
  gateAtLaunch: string[] | null = null;

  constructor(gate: FakePermissionRules) {
    super();
    this.gate = gate;
  }

  launch(name: string, input: Record<string, unknown>): string {
    this.gateAtLaunch = [...this.gate.calls];
    return super.launch(name, input);
  }
}

describe("launchCrew", () => {
  it("starts the crew, logs the launch with its ticket and returns the ticket", () => {
    const { crews, deps, logged } = setup();
    deepStrictEqual(launchCrew(deps, "project-init", { cwd: "/workspace" }), { ticket: "ticket-1" });
    deepStrictEqual(crews.launches, [{ name: "project-init", input: { cwd: "/workspace" } }]);
    deepStrictEqual(logged, [{ message: "project-init launched", data: { ticket: "ticket-1" } }]);
  });

  it("adds the caller's details to the launch log", () => {
    const { deps, logged } = setup();
    launchCrew(deps, "main-loop", { prompt: "hi" }, { permissionMode: "(session default)", permissionRules: 0 });
    deepStrictEqual(logged, [{
      message: "main-loop launched",
      data: { ticket: "ticket-1", permissionMode: "(session default)", permissionRules: 0 },
    }]);
  });

  it("turns a hop past the chain's limit into a refusal that says so (V-A5), and lets any other failure throw", () => {
    const { crews, deps, logged } = setup();
    crews.launch = () => { throw new Error("Async command chain refused at depth 9, limit 8."); };
    const result = launchCrew(deps, "dev-verify", {}, { batch: "b1" });
    const line = chainDepthLine("dev-verify", { depth: 9, limit: 8 });
    deepStrictEqual(result, { refused: line, message: line });
    deepStrictEqual(logged[0].data, { depth: 9, limit: 8, batch: "b1" });
    crews.launch = () => { throw new Error("crew not found"); };
    throws(() => launchCrew(deps, "dev-verify"), /crew not found/);
  });
});

describe("launchMainLoop", () => {
  function mainLoopSetup(...stored: string[]) {
    const { log, logged, warned } = setup();
    const gate = new FakePermissionRules();
    const crews = new GateWatchingCrewHost(gate);
    const store = new FakeSessionStore();
    store.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
    const config = createConfigStore({ files: new FakeFiles(), session: store });
    const catalogue = new FakeToolCatalogue();
    const deps = { session: createSessionIo({ store, config }), config, catalogue, crews, gate, log };
    return { gate, crews, logged, warned, store, config, catalogue, deps };
  }

  const FALLBACK_VIA = resolveFallbackMode(undefined).explanation;

  it("hands the gate the session's rules BEFORE the crew starts, then the crew its rules and mode", async () => {
    const { gate, crews, logged, warned, deps } = mainLoopSetup(
      "deny:file_write", "allow shell_command command=npm test*",
    );
    const ticket = await launchMainLoop(deps, { prompt: "fix it", permissionMode: null });
    deepStrictEqual(ticket, { ticket: "ticket-1" });
    const handed = ["clear", "add deny file_write", "add allow shell_command command=npm test*", ...MEMORY_GATE];
    deepStrictEqual(crews.gateAtLaunch, handed);
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

  it("denies every tool of the model a write under the memory's candidates and entries, in every mode", async () => {
    for (const mode of PERMISSION_MODES) {
      const { gate, crews, deps } = mainLoopSetup("allow file_write");
      await launchMainLoop(deps, { prompt: "go", permissionMode: mode });
      deepStrictEqual(crews.gateAtLaunch, ["clear", "add allow file_write", ...MEMORY_GATE], mode);
      for (const tool of PATH_WRITE_TOOLS) {
        for (const path of [
          "/workspace/.orkeon/memory/entries/mistake/x.md", ".orkeon/memory/entries/method/x.md",
          "/workspace/.orkeon/memory/candidates/x.md", ".orkeon/memory/candidates/x.md",
        ]) {
          strictEqual(ruleDecision(gate.rules, tool, { path, content: "status: admitted" }), "deny", `${mode} ${tool} ${path}`);
        }
      }
      strictEqual(ruleDecision(gate.rules, "file_write", { path: ".orkeon/memory/refused.md" }), "allow", mode);
    }
  });

  it("puts the guard on the memory.dir the settings name", async () => {
    const { gate, config, deps } = mainLoopSetup();
    await config.writeSession({ "memory.dir": "docs/memory" });
    await launchMainLoop(deps, { prompt: "go", permissionMode: "acceptEdits" });
    strictEqual(ruleDecision(gate.rules, "file_write", { path: "docs/memory/entries/decision/x.md" }), "deny");
    strictEqual(ruleDecision(gate.rules, "file_write", { path: ".orkeon/memory/entries/decision/x.md" }), undefined);
  });

  it("forwards the start script's output to the crew, and says how many lines it has", async () => {
    const { crews, logged, deps } = mainLoopSetup();
    const sessionStart = { script: "/tmp/orkeon-code/session-start.sh", lines: ["a", "b"] };
    await launchMainLoop(deps, { prompt: "hello", permissionMode: null, sessionStart });
    deepStrictEqual(crews.launches[0].input?.sessionStart, sessionStart);
    strictEqual((logged[0].data as { sessionStartLines?: number }).sessionStartLines, 2);
    await launchMainLoop(deps, { prompt: "again", permissionMode: null, sessionStart: null });
    strictEqual("sessionStart" in (crews.launches[1].input ?? {}), false);
  });

  it("resolves the session's mode when the request names none, and passes a named one as is", async () => {
    const { crews, store, deps } = mainLoopSetup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "acceptEdits");
    await launchMainLoop(deps, { prompt: "go", permissionMode: null });
    await launchMainLoop(deps, { prompt: "look", permissionMode: "plan" });
    deepStrictEqual(crews.launches.map((l) => [l.input?.permissionMode, l.input?.permissionModeVia]), [
      ["acceptEdits", "session default via /mode"],
      ["plan", undefined],
    ]);
  });

  it("empties the gate when the session holds no rules", async () => {
    const { gate, crews, deps } = mainLoopSetup();
    await launchMainLoop(deps, { prompt: "summarise", permissionMode: "plan" });
    deepStrictEqual(gate.calls, ["clear", ...MEMORY_GATE]);
    deepStrictEqual(crews.launches[0].input, {
      prompt: "summarise", permissionMode: "plan", permissionRules: [], extraTools: [],
    });
  });

  it("still launches, with a warning, when the host keeps no rules or a stored entry rotted", async () => {
    const { gate, crews, warned, deps } = mainLoopSetup("deny:file_write", "bogus");
    gate.kept = false;
    await launchMainLoop(deps, { prompt: "go", permissionMode: "default" });
    deepStrictEqual(crews.launches[0].input, {
      prompt: "go", permissionMode: "default", permissionRules: ["deny file_write"], extraTools: [],
    });
    deepStrictEqual(warned, [
      "1 stored permission entr(ies) are not rules and were ignored",
      "the host keeps no session rules: the gate decides each call from the mode alone",
    ]);
  });

  it("launches without the extra tools when tools.extra cannot be read, and leaves their rules stored", async () => {
    const { gate, crews, warned, store, deps } = mainLoopSetup("deny create_issue", "deny file_write");
    const files = new FakeFiles();
    files.readErrors.set("/workspace/.orkeon/config.json", new Error("permission denied"));
    const config = createConfigStore({ files, session: store });
    await launchMainLoop({ ...deps, config }, { prompt: "go", permissionMode: "default" });
    deepStrictEqual(crews.launches[0].input, {
      prompt: "go", permissionMode: "default", permissionRules: ["deny file_write"], extraTools: [],
    });
    deepStrictEqual(gate.calls, ["clear", "add deny file_write", ...MEMORY_GATE]);
    deepStrictEqual(warned, [
      "tools.extra could not be read (/workspace/.orkeon/config.json could not be read or parsed): no extra tool this turn",
      "permission rule 'deny create_issue' is dormant: tools.extra does not list its tool, the gate does not get it",
    ]);
    deepStrictEqual(JSON.parse(store.state.get(PERMISSION_RULES_STATE_KEY)!), ["deny create_issue", "deny file_write"]);
  });

  it("passes the extra tools the host registers, warns once per missing name or refused entry", async () => {
    const { gate, crews, logged, warned, config, catalogue, deps } = mainLoopSetup(
      "deny gone_tool", "allow search_issues query=bug*", "deny never_configured",
    );
    await config.writeSession({
      "tools.extra": "transcribe_audio:read, search_issues gone_tool:read bad:exec search_issues:read file_write",
    });
    catalogue.tools.set("transcribe_audio", "");
    catalogue.tools.set("search_issues", "");
    await launchMainLoop(deps, { prompt: "triage", permissionMode: "default" });
    deepStrictEqual(crews.launches[0].input, {
      prompt: "triage",
      permissionMode: "default",
      // A rule on a configured tool holds, registered or not; one on an unknown tool is dormant.
      permissionRules: ["deny gone_tool", "allow search_issues query=bug*"],
      extraTools: ["transcribe_audio:read", "search_issues:write"],
    });
    deepStrictEqual(gate.calls, ["clear", "add deny gone_tool", "add allow search_issues query=bug*", ...MEMORY_GATE]);
    const rule = "each entry is <name>[:read|:write], a tool that is not built in, named once";
    deepStrictEqual(warned, [
      "extra tool 'gone_tool' is not registered by the host and is left out " +
        "(its MCP server did not connect, its plugin did not load, or the name is mistyped)",
      `tools.extra: 'bad:exec' is ignored (${rule})`,
      `tools.extra: 'search_issues:read' is ignored (${rule})`,
      `tools.extra: 'file_write' is ignored (${rule})`,
      "permission rule 'deny never_configured' is dormant: tools.extra does not list its tool, the gate does not get it",
    ]);
    deepStrictEqual(logged[0].data, { ticket: "ticket-1", permissionMode: "default", permissionRules: 2, extraTools: 2 });
  });

  it("hands the crew the names an MCP server registers, kebab, camel or snake, whatever case the setting uses", async () => {
    const { crews, warned, config, catalogue, deps } = mainLoopSetup();
    await config.writeSession({ "tools.extra": "Get-File-Contents:read listissues SEARCH_CODE get_file_contents" });
    for (const name of ["get-file-contents", "listIssues", "search_code"]) catalogue.tools.set(name, "");
    await launchMainLoop(deps, { prompt: "triage", permissionMode: "default" });
    deepStrictEqual((crews.launches[0].input as MainLoopInputs).extraTools, [
      "get-file-contents:read", "listIssues:write", "search_code:write",
    ]);
    // Another spelling of a registered name is not that tool: act would fail the turn on it.
    deepStrictEqual(warned, [
      "extra tool 'get_file_contents' is not registered by the host and is left out " +
        "(its MCP server did not connect, its plugin did not load, or the name is mistyped)",
    ]);
  });
});

describe("launchMainLoop — voice.reply", () => {
  /** A session whose voice.reply holds `value` (unset when undefined), the host registering `registered`. */
  async function voiceSetup(value: string | undefined, ...registered: string[]) {
    const crews = new FakeCrewHost();
    const store = new FakeSessionStore();
    const config = createConfigStore({ files: new FakeFiles(), session: store });
    if (value !== undefined) await config.writeSession({ "voice.reply": value });
    const catalogue = new FakeToolCatalogue();
    for (const name of registered) catalogue.tools.set(name, "");
    const warned: string[] = [];
    const log = { info: () => {}, warn: (message: string) => warned.push(message) };
    return {
      crews, warned, config,
      deps: { session: createSessionIo({ store, config }), config, catalogue, crews, gate: new FakePermissionRules(), log },
    };
  }

  it("adds the epilogue that reads the answer aloud, under speak's registered name, when it is on", async () => {
    const s = await voiceSetup("on", "Speak");
    await launchMainLoop(s.deps, { prompt: "hi", permissionMode: "default" });
    deepStrictEqual((s.crews.launches[0].input as MainLoopInputs).epilogue,
      { tool: "Speak", args: {}, textArg: "text", label: "Reply read aloud" });
    deepStrictEqual(s.warned, []);
  });

  it("adds nothing when it is off or unset, and warns when it is on without speak", async () => {
    const off = await voiceSetup("off", "speak");
    await launchMainLoop(off.deps, { prompt: "hi", permissionMode: "default" });
    strictEqual((off.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    const unset = await voiceSetup(undefined, "speak");
    await launchMainLoop(unset.deps, { prompt: "hi", permissionMode: "default" });
    strictEqual((unset.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    const missing = await voiceSetup("on");
    await launchMainLoop(missing.deps, { prompt: "hi", permissionMode: "default" });
    strictEqual((missing.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    deepStrictEqual(missing.warned, [
      "voice.reply is on but the host registers no 'speak': the answer is not read aloud " +
        "(start orkeon-code with ORKEON_CODE_AUDIO_DIR and ORKEON_CODE_VOICE=1)",
    ]);
  });

  it("launches the turn without reading aloud when the setting cannot be read", async () => {
    const s = await voiceSetup("on", "speak");
    const unreadable = { ...s.deps, config: { ...s.config, readValue: async () => { throw new Error("config.json unreadable"); } } };
    await launchMainLoop(unreadable as typeof s.deps, { prompt: "hi", permissionMode: "default" });
    strictEqual(s.crews.launches.length, 1, "the turn still runs");
    strictEqual((s.crews.launches[0].input as MainLoopInputs).epilogue, undefined);
    deepStrictEqual(s.warned, [
      "tools.extra could not be read (config.json unreadable): no extra tool this turn",
      "voice.reply could not be read (config.json unreadable): the answer is not read aloud this turn",
    ]);
  });
});

describe("/mode plan, then a request without a mode: prefix", () => {
  it("offers the plan catalogue and runs the act call in plan", async () => {
    const crews = new FakeCrewHost();
    const store = new FakeSessionStore();
    const files = new FakeFiles();
    const config = createConfigStore({ files, session: store });
    const session = createSessionIo({ store, config });
    await runMode(["plan"], { session, log: new FakeLogger() });

    const { prompt, permissionMode } = parseAssistantInput("explain the cache layer");
    await launchMainLoop({
      session, config, catalogue: new FakeToolCatalogue(), crews, gate: new FakePermissionRules(), log: new FakeLogger(),
    }, { prompt, permissionMode });
    const input = crews.launches[0].input as MainLoopInputs;
    const loaded = loadCatalogue(input);
    deepStrictEqual(loaded.catalogue.tools, toolsetFor("plan"));

    const llm = new FakeLlm();
    llm.answers = ["the cache layer, explained"]; // a blank answer would be sent back once (stop chain)
    const log = new FakeLogger();
    const run = new FakeRunState();
    run.fields = { [BREAKER_RUN_FIELD]: 0 };
    await runMainLoop(input, loaded, {
      shell: new FakeShell(), session, files, telemetry: new FakeTelemetry(), memory: new FakeMemoryStore(),
      llm, log, run, tools: new FakeToolCatalogue(), compact: async () => ({ status: "skipped", reason: "below trigger" }),
    });
    strictEqual(llm.acts[0].request.permissionMode, "plan");
    deepStrictEqual(log.lines, ["info: permission mode 'plan' — session default via /mode"]);
  });
});

describe("writeCompleted", () => {
  const completed = (result: CrewCompletion, label: string, okPrefix?: string) => {
    const lines: string[] = [];
    writeCompleted({ writeLine: (line: string) => lines.push(line) }, result, label, okPrefix);
    return lines;
  };

  it("writes the payload of a success, after the prefix when there is one", () => {
    deepStrictEqual(completed({ success: true, payload: "report written" }, "review"), ["report written"]);
    deepStrictEqual(completed({ success: true, payload: "abc123" }, "commit", "✓ committed "), ["✓ committed abc123"]);
  });

  it("writes the failure with the label and the error, or 'unknown'", () => {
    deepStrictEqual(completed({ success: false, error: "no diff" }, "review"), ["✗ review failed: no diff"]);
    deepStrictEqual(completed({ success: false }, "analyze", "ignored "), ["✗ analyze failed: unknown"]);
  });
});
