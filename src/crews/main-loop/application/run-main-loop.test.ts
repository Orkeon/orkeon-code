// One main-loop turn over the fakes of its ports. Run:
//   node --test src/crews/main-loop/application/run-main-loop.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok, rejects } from "node:assert";

import { loadCatalogue, runMainLoop } from "./run-main-loop.ts";
import type { LoadedCatalogue } from "./run-main-loop.ts";
import { BREAKER_RUN_FIELD } from "./auto-compact.ts";
import { buildStaticHeader } from "../domain/prompt-assembly.ts";
import { buildActPrompt, catalogueFor, toolsetFor } from "../../../shared/domain/agent-policy/permission.ts";
import {
  DEFAULT_BEHAVIOR_FLAGS, describeActiveFlags, maxIterationsFor, resolveBehaviorFlags,
} from "../../../shared/domain/agent-policy/behavior-flags.ts";
import {
  AUTOCOMPACT_BREAKER_STATE_KEY, DEFAULT_MODE_STATE_KEY, EFFORT_STATE_KEY, MODEL_PREFERENCE_STATE_KEY,
} from "../../../shared/domain/session-keys.ts";
import { llmFailureOf } from "../../../shared/domain/llm-failure.ts";
import {
  DEFAULT_LOADED, DENYING_CHAINS, DICTATION, EXPLICIT_PLAN, EXTRAS, EXTRA_RULES, EXTRA_TOOLS_INPUT, PARSED_RULES,
  REQUEST_WITH_TRANSCRIPT, RULED_CATALOGUE, SCRIPT_TOOLS_CASES, SESSION_START, SILENT_GATES, SPEAK, SPEAKER_FAILURE,
  STORED_RULES, TRANSCRIPT, TRANSCRIPTION_PRELUDE, turnSetup,
} from "./run-main-loop.fixtures.ts";
import { assertGateWarningBefore, assertLogged, assertLoggedLike, assertPromptEndsWith } from "./run-main-loop.assertions.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";

describe("loadCatalogue", () => {
  it("builds the catalogue of the explicit mode, with the stored rules that parse", () => {
    // Arrange
    const input = { permissionMode: "plan", permissionRules: STORED_RULES };

    // Act
    const loaded = loadCatalogue(input);

    // Assert
    strictEqual(loaded.mode, "plan");
    deepStrictEqual(loaded.catalogue, catalogueFor("plan", PARSED_RULES));
    deepStrictEqual(loaded.catalogue.deniedByRule, ["file_read"]);
  });

  for (const c of SCRIPT_TOOLS_CASES) {
    it(`${c.name} of the shared memory`, () => {
      // Arrange
      const { input } = c;

      // Act
      const loaded = loadCatalogue(input);

      // Assert
      deepStrictEqual(loaded.scriptTools, c.expected);
    });
  }

  it("offers acceptEdits the shell: the host gate asks before each command", () => {
    // Arrange
    const input = { permissionMode: "acceptEdits" };

    // Act
    const loaded = loadCatalogue(input);

    // Assert
    ok(loaded.catalogue.tools.includes("shell_command"));
  });

  it("builds the default mode's full catalogue without an explicit mode or rules", () => {
    // Arrange
    const input = {};

    // Act
    const loaded = loadCatalogue(input);

    // Assert
    strictEqual(loaded.mode, "default");
    deepStrictEqual(loaded.extras, []);
    deepStrictEqual(loaded.catalogue.tools, toolsetFor("default"));
  });

  it("adds the extra tools plan offers, and reads the rules that name them", () => {
    // Arrange
    const input = { ...EXTRA_TOOLS_INPUT, permissionMode: "plan" };

    // Act
    const plan = loadCatalogue(input);

    // Assert
    deepStrictEqual(plan.extras, EXTRAS);
    deepStrictEqual(plan.catalogue, catalogueFor("plan", EXTRA_RULES, EXTRAS));
    ok(plan.catalogue.tools.includes("transcribe_audio"));
    ok(!plan.catalogue.tools.includes("search_issues"));
  });

  it("adds the extra tools default offers, less the one a rule denies", () => {
    // Arrange
    const input = { ...EXTRA_TOOLS_INPUT, permissionMode: "default" };

    // Act
    const byDefault = loadCatalogue(input);

    // Assert
    deepStrictEqual(byDefault.catalogue.deniedByRule, ["search_issues"]);
    deepStrictEqual(byDefault.catalogue.tools, toolsetFor("default", EXTRAS).filter((t) => t !== "search_issues"));
  });
});

describe("runMainLoop — a prelude before the turn (/transcribe --then)", () => {
  it("makes the call first and puts its result after the request, in the message stored and the one the model reads", async () => {
    // Arrange
    const { store, llm, log, tools, deps } = turnSetup();
    tools.tools.set("transcribe_audio", TRANSCRIPT);

    // Act
    const answer = await runMainLoop(
      { prompt: " list the tasks ", permissionMode: "plan", prelude: TRANSCRIPTION_PRELUDE }, EXPLICIT_PLAN, deps,
    );

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(tools.calls, [{ name: "transcribe_audio", args: { path: "/audio/daily.m4a", language: "fr" } }]);
    deepStrictEqual(store.messages[0], { role: "user", content: REQUEST_WITH_TRANSCRIPT });
    assertPromptEndsWith(llm.acts[0].prompt, buildActPrompt(REQUEST_WITH_TRANSCRIPT, "plan"));
    assertLogged(log.lines, "info: Transcription of /audio/daily.m4a: transcribe_audio, before the turn");
  });

  it("fails the run on a failed call, before any message is stored or any model called", async () => {
    // Arrange
    const { store, llm, tools, deps } = turnSetup();
    tools.tools.set("transcribe_audio", new Error("no file at /audio/daily.m4a"));

    // Act
    const act = runMainLoop({ prompt: "list the tasks", prelude: TRANSCRIPTION_PRELUDE }, EXPLICIT_PLAN, deps);

    // Assert
    await rejects(act, (e: Error) => String(e) === "transcribe_audio: no file at /audio/daily.m4a");
    deepStrictEqual([store.messages, llm.acts], [[], []]);
  });

  it("makes a dictation the request itself (as: request)", async () => {
    // Arrange
    const { store, llm, tools, deps } = turnSetup();
    tools.tools.set("record_and_transcribe", " rename parseArgs to parseCliArgs ");

    // Act
    const answer = await runMainLoop({ prompt: "", permissionMode: "plan", prelude: DICTATION }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(store.messages[0], { role: "user", content: "rename parseArgs to parseCliArgs" });
    assertPromptEndsWith(llm.acts[0].prompt, buildActPrompt("rename parseArgs to parseCliArgs", "plan"));
  });

  it("says so, without a model call, when a dictation came back empty", async () => {
    // Arrange
    const { llm, tools, deps } = turnSetup();
    tools.tools.set("record_and_transcribe", "");

    // Act
    const answer = await runMainLoop({ prompt: "", prelude: DICTATION }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "Nothing to send: Dictation came back empty.");
    strictEqual(llm.acts.length, 0);
  });

  it("ignores a prelude that names no tool", async () => {
    // Arrange
    const { store, tools, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "explain", permissionMode: "plan", prelude: { args: {} } }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(store.messages[0], { role: "user", content: "explain" });
    deepStrictEqual(tools.calls, []);
  });

  it("still answers a blank request without a call", async () => {
    // Arrange
    const { tools, deps } = turnSetup();

    // Act
    const answer = await runMainLoop({ prompt: " ", prelude: TRANSCRIPTION_PRELUDE }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "No prompt provided.");
    deepStrictEqual(tools.calls, []);
  });
});

describe("runMainLoop — an epilogue after the turn (voice.reply)", () => {
  it("calls the tool with the answer once it is stored, and logs what it said", async () => {
    // Arrange
    const { store, log, tools, deps } = turnSetup();
    const seen: Array<{ args: Record<string, unknown>; stored: number }> = [];
    tools.tools.set("speak", (args: Record<string, unknown>) => {
      seen.push({ args, stored: store.messages.length });
      return "[reading aloud: 10 characters, 1 s]";
    });

    // Act
    const answer = await runMainLoop({ prompt: "capital of France?", permissionMode: "plan", epilogue: SPEAK }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(seen, [{ args: { text: "the answer" }, stored: 2 }]);
    assertLogged(log.lines, "info: Reply read aloud: [reading aloud: 10 characters, 1 s]");
  });

  it("keeps the turn and its answer when the call fails, with a warning", async () => {
    // Arrange
    const { store, log, tools, deps } = turnSetup();
    tools.tools.set("speak", new Error(SPEAKER_FAILURE));

    // Act
    const answer = await runMainLoop({ prompt: "hi", permissionMode: "plan", epilogue: SPEAK }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    strictEqual(store.messages.length, 2);
    assertLogged(log.lines, "warn: Reply read aloud: speak failed: no speaker access (PortAudio library not found)");
  });

  it("calls nothing without an epilogue", async () => {
    // Arrange
    const { tools, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "hi", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(tools.calls, []);
  });

  it("calls nothing with a blank answer", async () => {
    // Arrange
    const { llm, tools, deps } = turnSetup();
    llm.answers = ["  "];
    tools.tools.set("speak", "[reading aloud]");

    // Act
    await runMainLoop({ prompt: "hi", permissionMode: "plan", epilogue: SPEAK }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(tools.calls, [], "nothing to read");
  });
});

describe("runMainLoop — the turn", () => {
  it("answers a blank prompt without a turn", async () => {
    // Arrange
    const { store, llm, compactions, deps } = turnSetup();

    // Act
    const answer = await runMainLoop({ prompt: "   " }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "No prompt provided.");
    deepStrictEqual(llm.acts, []);
    deepStrictEqual(store.messages, []);
    deepStrictEqual(compactions, []);
  });

  it("appends the user and the assistant messages and answers", async () => {
    // Arrange
    const { store, llm, deps } = turnSetup();

    // Act
    const answer = await runMainLoop({ prompt: "  fix the parser ", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(store.messages, [
      { role: "user", content: "fix the parser" },
      { role: "assistant", content: "the answer" },
    ]);
    assertPromptEndsWith(llm.acts[0].prompt, buildActPrompt("fix the parser", "plan"));
  });

  it("hands the explicit mode, and its tools in the system message, to the act call", async () => {
    // Arrange
    const { llm, log, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "explain", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(llm.acts.map((a) => a.request), [{
      maxIterations: maxIterationsFor(DEFAULT_BEHAVIOR_FLAGS.effort),
      permissionMode: "plan",
      system: buildStaticHeader({ toolNames: toolsetFor("plan") }),
      model: "",
    }]);
    deepStrictEqual(log.lines, []);
  });

  it("runs in the session mode the command resolved, and says where it came from", async () => {
    // Arrange
    const { llm, log, deps } = turnSetup();
    const input = { prompt: "explain", permissionMode: "acceptEdits", permissionModeVia: "session default via /mode" };

    // Act
    await runMainLoop(input, loadCatalogue(input), deps);

    // Assert
    strictEqual(llm.acts[0].request.permissionMode, "acceptEdits");
    strictEqual(llm.acts[0].request.system, buildStaticHeader({ toolNames: toolsetFor("acceptEdits") }));
    deepStrictEqual(log.lines, ["info: permission mode 'acceptEdits' — session default via /mode"]);
  });

  it("launched without a mode, runs in default whatever the session holds, and says so", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();
    store.state.set(DEFAULT_MODE_STATE_KEY, "plan");
    const loaded = loadCatalogue({});

    // Act
    await runMainLoop({ prompt: "explain" }, loaded, deps);

    // Assert
    strictEqual(llm.acts[0].request.permissionMode, "default");
    deepStrictEqual(loaded.catalogue.tools, toolsetFor("default"));
    strictEqual(llm.acts[0].request.system, buildStaticHeader({ toolNames: toolsetFor("default") }));
    deepStrictEqual(log.lines, ["info: permission mode 'default' — no mode given at launch, built-in 'default'"]);
  });

  it("lists the extra tools of the mode in the system message", async () => {
    // Arrange
    const { llm, deps } = turnSetup();
    const input = { prompt: "transcribe it", permissionMode: "plan", extraTools: ["transcribe_audio:read", "post:write"] };

    // Act
    await runMainLoop(input, loadCatalogue(input), deps);

    // Assert
    strictEqual(llm.acts[0].request.system, buildStaticHeader({ toolNames: [...toolsetFor("plan"), "transcribe_audio"] }));
  });

  it("announces what the rules changed in the catalogue, and the rules without effect", async () => {
    // Arrange
    const { log, deps } = turnSetup();
    const loaded: LoadedCatalogue = RULED_CATALOGUE;

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, loaded, deps);

    // Assert
    deepStrictEqual(log.lines, [
      "warn: permission rules removed: file_read",
      "warn: permission rule without effect: mode 'plan' does not offer 'file_write'",
    ]);
  });

  it("shapes the act call by the behaviour flags, and announces them", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();
    store.state.set(EFFORT_STATE_KEY, "high");
    store.state.set(MODEL_PREFERENCE_STATE_KEY, "gpt-x");
    const flags = resolveBehaviorFlags({ effort: "high", model: "gpt-x" });

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(llm.acts[0].request.maxIterations, maxIterationsFor("high"));
    strictEqual(llm.acts[0].request.effort, "high");
    strictEqual(llm.acts[0].request.model, "gpt-x");
    deepStrictEqual(log.lines, [
      `info: session flags — ${describeActiveFlags(flags)}`,
      "info: act — effort: high, maxIterations: 80",
    ]);
  });

  it("forwards /effort low to the act and logs it", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();
    store.state.set(EFFORT_STATE_KEY, "low");

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(llm.acts[0].request.effort, "low");
    strictEqual(llm.acts[0].request.maxIterations, 10);
    assertLogged(log.lines, "info: act — effort: low, maxIterations: 10");
  });

  it("forwards no effort when no level is set", async () => {
    // Arrange
    const { llm, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual("effort" in llm.acts[0].request, false);
  });

  it("fails a turn the provider failed: no answer stored, no tail compaction, the error out", async () => {
    // Arrange
    const { store, llm, compactions, deps } = turnSetup();
    llm.answers = [llmFailureOf("<undefined-llm:429 rate limited>")!];

    // Act
    const act = runMainLoop({ prompt: "fix it", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    await rejects(act, { name: "LlmFailure", message: "the model call failed: 429 rate limited" });
    deepStrictEqual(store.messages, [{ role: "user", content: "fix it" }]);
    deepStrictEqual(compactions, [1], "the head compaction only");
    strictEqual(store.state.has(AUTOCOMPACT_BREAKER_STATE_KEY), false, "a failed turn is not a failed compaction");
  });

  it("still answers when the session store is down", async () => {
    // Arrange
    const { store, llm, deps } = turnSetup();
    store.failure = new Error("no session tools");

    // Act
    const answer = await runMainLoop({ prompt: "go" }, loadCatalogue({}), deps);

    // Assert
    strictEqual(answer, "the answer");
    strictEqual(llm.acts[0].request.permissionMode, "default");
  });
});

describe("runMainLoop — auto-compaction", () => {
  it("compacts after the user message and after the answer", async () => {
    // Arrange
    const { compactions, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(compactions, [1, 2]);
  });

  it("counts each failed compaction in the session and in the run state", async () => {
    // Arrange
    const { store, run, log, deps } = turnSetup({ status: "failed", reason: "model down" });

    // Act
    await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(store.state.get(AUTOCOMPACT_BREAKER_STATE_KEY), "2");
    strictEqual(run.fields[BREAKER_RUN_FIELD], 2);
    deepStrictEqual(log.lines, ["warn: auto-compact failed: model down", "warn: auto-compact failed: model down"]);
  });

  it("does not compact while the breaker is open", async () => {
    // Arrange
    const { store, log, compactions, deps } = turnSetup();
    store.state.set(AUTOCOMPACT_BREAKER_STATE_KEY, "3");
    const suppressed = "warn: auto-compact suppressed (breaker open after 3 consecutive failures)";

    // Act
    const answer = await runMainLoop({ prompt: "go", permissionMode: "plan" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(compactions, []);
    deepStrictEqual(log.lines, [suppressed, suppressed]);
  });
});

describe("runMainLoop — the host gate's state", () => {
  it("warns the operator when the host says its gate is off", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();
    llm.gateEnabled = false;

    // Act
    const first = await runMainLoop({ prompt: "hi" }, DEFAULT_LOADED, deps);

    // Assert
    assertGateWarningBefore(first, "the answer");
    strictEqual(store.state.get("gate.warned"), "1");
    ok(log.lines.some((l) => l.startsWith("warn: ⚠ the host's permission gate is off")), log.lines.join("\n"));
  });

  it("warns once per session, the transcript keeping the answers alone", async () => {
    // Arrange
    const { store, llm, deps } = turnSetup();
    llm.gateEnabled = false;
    await runMainLoop({ prompt: "hi" }, DEFAULT_LOADED, deps);

    // Act
    const second = await runMainLoop({ prompt: "again" }, DEFAULT_LOADED, deps);

    // Assert
    strictEqual(second, "the answer");
    ok(store.messages.every((m) => !JSON.stringify(m).includes("permission gate is off")), "the transcript keeps the answers alone");
  });

  for (const c of SILENT_GATES) {
    it(`says nothing ${c.name}`, async () => {
      // Arrange
      const { llm, deps } = turnSetup();
      llm.gateEnabled = c.gate;
      const loaded = loadCatalogue({ permissionMode: c.mode });

      // Act
      const answer = await runMainLoop({ prompt: "hi" }, loaded, deps);

      // Assert
      strictEqual(answer, "the answer");
    });
  }
});

describe("runMainLoop — the turn-start and stop chains", () => {
  it("stores the start script's lines as [turn-context] just before the request, once", async () => {
    // Arrange
    const { store, llm, deps } = turnSetup();

    // Act
    const answer = await runMainLoop({ prompt: "hello", sessionStart: SESSION_START }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the answer");
    strictEqual(store.messages.length, 3);
    strictEqual(store.messages[0].role, "user");
    ok(store.messages[0].content.startsWith("[turn-context] "), store.messages[0].content);
    assertMentions(store.messages[0].content, [
      "(/tmp/orkeon-code/session-start.sh) printed:", "  state: .orkeon/dev/demo/state-F2.md",
    ]);
    deepStrictEqual(store.messages[1], { role: "user", content: "hello" });
    strictEqual(llm.acts.length, 1);
  });

  it("stores no context message without start lines, nor for a malformed sessionStart", async () => {
    // Arrange
    const { store, deps } = turnSetup();

    // Act
    await runMainLoop({ prompt: "hello", sessionStart: { script: "", lines: ["x"] } }, EXPLICIT_PLAN, deps);

    // Assert
    deepStrictEqual(store.messages[0], { role: "user", content: "hello" });
  });

  it("ends a turn a turn-start guard denies: nothing stored, no model call, the refusal as the answer", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();

    // Act
    const text = await runMainLoop({ prompt: "hello" }, EXPLICIT_PLAN, { ...deps, chains: DENYING_CHAINS });

    // Assert
    strictEqual(text, "turn refused (one-batch): F2 is running");
    deepStrictEqual([store.messages, llm.acts], [[], []]);
    assertLoggedLike(log.lines, "turn refused (one-batch)");
  });

  it("sends an empty answer back once with the reason, and keeps the second answer", async () => {
    // Arrange
    const { store, llm, deps } = turnSetup();
    llm.answers = ["   ", "the second answer"];

    // Act
    const answer = await runMainLoop({ prompt: "explain" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "the second answer");
    strictEqual(llm.acts.length, 2);
    assertMentions(llm.acts[1].prompt, ["[stop-check] Your previous answer to this request was sent back: the answer was empty"]);
    deepStrictEqual(store.messages.at(-1), { role: "assistant", content: "the second answer" });
  });

  it("retries once only: a second empty answer stands", async () => {
    // Arrange
    const { llm, deps } = turnSetup();
    llm.answers = ["", ""];

    // Act
    const answer = await runMainLoop({ prompt: "explain" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "");
    strictEqual(llm.acts.length, 2);
  });

  it("keeps the first answer, with a warning, when the retry the stop check asked for fails", async () => {
    // Arrange
    const { store, llm, log, deps } = turnSetup();
    llm.answers = ["done", new Error("provider down")];

    // Act
    const answer = await runMainLoop({ prompt: "audit", closingLine: "VERDICT:" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "done");
    strictEqual(llm.acts.length, 2);
    deepStrictEqual(store.messages.at(-1), { role: "assistant", content: "done" });
    assertLoggedLike(log.lines, "the retry failed (provider down); the first answer stands");
  });

  it("fails the turn when the retry of an empty answer fails", async () => {
    // Arrange
    const { llm, deps } = turnSetup();
    llm.answers = ["  ", new Error("provider down")];

    // Act
    const act = runMainLoop({ prompt: "explain" }, EXPLICIT_PLAN, deps);

    // Assert
    await rejects(act, /provider down/);
  });

  it("sends back an answer without the closing line the command names", async () => {
    // Arrange
    const { llm, deps } = turnSetup();
    llm.answers = ["done", "done\nVERDICT: VALID"];

    // Act
    const answer = await runMainLoop({ prompt: "audit", closingLine: "VERDICT:" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(answer, "done\nVERDICT: VALID");
    assertMentions(llm.acts[1].prompt, ["no line starting with 'VERDICT:'"]);
  });

  it("does not send back an answer that holds the closing line", async () => {
    // Arrange
    const { llm, deps } = turnSetup();
    llm.answers = ["  VERDICT: GAPS"];

    // Act
    await runMainLoop({ prompt: "audit", closingLine: "VERDICT:" }, EXPLICIT_PLAN, deps);

    // Assert
    strictEqual(llm.acts.length, 1);
  });
});
