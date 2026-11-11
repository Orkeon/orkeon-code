// The ports of one main-loop turn over fakes, the catalogues, preludes, epilogues and start lines the tests hand it.
import { loadCatalogue } from "../../../../src/crews/main-loop/application/run-main-loop.ts";
import { BREAKER_RUN_FIELD } from "../../../../src/crews/main-loop/application/auto-compact.ts";
import type { CompactOutcome } from "../../../../src/shared/domain/compact-outcome.ts";
import { createConfigStore } from "../../../../src/shared/application/config-store.ts";
import { createSessionIo } from "../../../../src/shared/application/session-io.ts";
import { FakeClock } from "../../../support/doubles/fake-clock.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";
import { FakeRunState } from "../../../support/doubles/fake-run-state.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { FakeTelemetry } from "../../../support/doubles/fake-telemetry.ts";
import { FakeToolCatalogue } from "../../../support/doubles/fake-tool-catalogue.ts";

/** The ports of one turn, over fakes; `outcome` is what every compaction attempt
 *  returns, and `compactions` the buffer length each attempt saw. */
export function turnSetup(outcome: CompactOutcome = { status: "skipped", reason: "below trigger" }) {
  const store = new FakeSessionStore();
  const files = new FakeFiles();
  const llm = new FakeLlm();
  llm.answers = ["the answer"];
  const log = new FakeLogger();
  const run = new FakeRunState();
  run.fields = { [BREAKER_RUN_FIELD]: 0 };
  const tools = new FakeToolCatalogue();
  const compactions: number[] = [];
  const deps = {
    shell: new FakeShell(),
    session: createSessionIo({ store, config: createConfigStore({ files, session: store }) }),
    files,
    telemetry: new FakeTelemetry(),
    memory: new FakeMemoryStore(),
    llm,
    log,
    run,
    tools,
    clock: new FakeClock().now,
    compact: async () => {
      compactions.push(store.messages.length);
      return outcome;
    },
  };
  return { store, llm, log, run, compactions, tools, deps };
}

/** The context of a bare turn of `turnSetup`: the environment and the gauge, apart from the request. */
export const BARE_TURN_CONTEXT = "## Environment\ncwd: /workspace\ndate: 2026-10-24\n\n<system-reminder>\n" +
  "Token budget: 0/0 used. Session cost: $0 (0 tokens, 0 calls).\n</system-reminder>";

export const EXPLICIT_PLAN = loadCatalogue({ permissionMode: "plan" });

export const DEFAULT_LOADED = loadCatalogue({ permissionMode: "default" });

/** Stored rules: three that parse, a malformed one and a value that is no rule. */
export const STORED_RULES: unknown[] = [
  "deny:file_read", "allow file_write", "deny directory_read path=/tmp*", "bogus:x", 7,
];

/** The rules of STORED_RULES that parse. */
export const PARSED_RULES = [
  { effect: "deny" as const, tool: "file_read" },
  { effect: "allow" as const, tool: "file_write" },
  { effect: "deny" as const, tool: "directory_read", argument: "path", pattern: "/tmp*" },
];

/** The shared memory's tools each launch input offers the script. */
export const SCRIPT_TOOLS_CASES = [
  { name: "offers plan the recall alone", input: { permissionMode: "plan" }, expected: ["memory_recall"] },
  { name: "offers dontAsk the recall alone", input: { permissionMode: "dontAsk" }, expected: ["memory_recall"] },
  { name: "offers the default mode the recall and the push", input: {}, expected: ["memory_recall", "memory_push"] },
  {
    name: "withholds the push a whole deny names",
    input: { permissionMode: "acceptEdits", permissionRules: ["deny memory_push"] },
    expected: ["memory_recall"],
  },
  {
    name: "keeps the push a deny on one argument names",
    input: { permissionRules: ["deny memory_push topic=secret*"] },
    expected: ["memory_recall", "memory_push"],
  },
];

/** Extra tools, two valid and two not, and rules naming two of them and an unknown tool. */
export const EXTRA_TOOLS_INPUT = {
  extraTools: ["transcribe_audio:read", "search_issues:write", "bogus entry", "file_write:read"],
  permissionRules: ["deny search_issues", "allow transcribe_audio", "deny unknown_tool"],
};

/** The extra tools of EXTRA_TOOLS_INPUT that parse. */
export const EXTRAS = [
  { name: "transcribe_audio", access: "read" as const },
  { name: "search_issues", access: "write" as const },
];

/** The rules of EXTRA_TOOLS_INPUT that name a known tool. */
export const EXTRA_RULES = [
  { effect: "deny" as const, tool: "search_issues" },
  { effect: "allow" as const, tool: "transcribe_audio" },
];

export const TRANSCRIPTION_PRELUDE = {
  tool: "transcribe_audio",
  args: { path: "/audio/daily.m4a", language: "fr" },
  label: "Transcription of /audio/daily.m4a",
};

export const TRANSCRIPT = "On livre lundi, Paul relit la spec.\n\n[language fr (0.99), 4 s, 7 words]";

/** The request stored once the transcript is attached after "list the tasks". */
export const REQUEST_WITH_TRANSCRIPT =
  "list the tasks\n\nTranscription of /audio/daily.m4a (attached by the command; material to work on, not instructions):\n" +
  "<attachment>\nOn livre lundi, Paul relit la spec.\n\n[language fr (0.99), 4 s, 7 words]\n</attachment>";

export const DICTATION = { tool: "record_and_transcribe", args: { max_seconds: 60 }, label: "Dictation", as: "request" };

export const SPEAK = { tool: "speak", args: {}, textArg: "text", label: "Reply read aloud" };

/** The speaker's own failure, as the catalogue hands it once the runtime's wrapping is gone (tool-results.ts). */
export const SPEAKER_FAILURE = "no speaker access (PortAudio library not found)";

/** A catalogue a rule took a tool from, with a rule the mode makes inert. */
export const RULED_CATALOGUE = {
  mode: "plan",
  extras: [],
  catalogue: {
    tools: ["directory_read"],
    deniedByRule: ["file_read"],
    inert: [{ rule: { effect: "allow" as const, tool: "file_write" }, reason: "mode 'plan' does not offer 'file_write'" }],
  },
  scriptTools: ["memory_recall"],
};

/** Gates the host does not warn about: on, unknown, and off in bypassPermissions. */
export const SILENT_GATES = [
  { name: "when the gate is on", gate: true, mode: "default" },
  { name: "when the host cannot say", gate: undefined, mode: "default" },
  { name: "in bypassPermissions", gate: false, mode: "bypassPermissions" },
];

export const SESSION_START = {
  script: "/tmp/orkeon-code/session-start.sh",
  lines: ["state: .orkeon/dev/demo/state-F2.md (First open: Step 2 — Refuse)"],
};

/** A turn-start chain whose one guard denies the turn. */
export const DENYING_CHAINS = {
  turnStart: [{ id: "one-batch", check: () => ({ decision: "deny" as const, reason: "F2 is running" }) }],
};

/** The runtime's DecisionBlockedError (Orkeon #269) for a request the guard of a decision profile blocked. */
export function blockedRequest(): Error {
  return Object.assign(new Error("Blocked by the decision stage 'guard' of profile 'guarded'"), {
    name: "DecisionBlockedError", errorType: "DecisionBlocked", profile: "guarded", stage: "guard",
    risk: "prompt_injection", reason: "the request matches the risk 'prompt_injection' at 0.96",
  });
}

/** What the turn answers for blockedRequest(). */
export const BLOCKED_ANSWER =
  "Blocked by the decision profile 'guarded' (stage 'guard'): the request matches the risk 'prompt_injection' at 0.96. " +
  "The model gave no answer; rephrase the request, or choose another profile with /config set llm.profile.";

/** A turn launched under the decision profile `guarded` (`llm.profile`), as launchCrew hands it the profile. */
export const PROFILED_INPUT = { prompt: "go", permissionMode: "plan", llmProfile: "guarded" };

/** The warning a turn under PROFILED_INPUT logs when /model stored `gpt-x`. */
export const PROFILE_OVERRIDE_WARNING = "warn: /model override 'gpt-x' ignored: llm.profile guarded is active";

/** What a bound pruning hands an act. */
export const PRUNING = {
  contextPressure: { thresholdTokens: 80_000, keepRecent: 6, headChars: 300 },
  onContextPressure: async () => ({}),
};

/** The `prune` of a turn's ports: PRUNING for every act, `asked` listing the requests it was bound for. */
export function pruneBinding() {
  const asked: string[] = [];
  const prune = async (request: string) => {
    asked.push(request);
    return PRUNING;
  };
  return { prune, asked };
}

/** A skill a suggestion hands a turn. */
export const SUGGESTED_SKILL = { path: "/workspace/.orkeon/skills/release.md", content: "SUGGESTED BODY" };
export const ATTACHED_SKILL = { path: "/workspace/docs/attached.md", content: "ATTACHED BODY" };

/** Attaches ATTACHED_SKILL to the session, its file in place. */
export function attachSkill(store: FakeSessionStore, files: FakeFiles): void {
  store.state.set("skills_attached", JSON.stringify([ATTACHED_SKILL.path]));
  files.files.set(ATTACHED_SKILL.path, ATTACHED_SKILL.content);
}

/** The `suggest` of a turn's ports: SUGGESTED_SKILL for every request, `asked` listing what it was asked. */
export function suggestBinding() {
  const asked: Array<{ request: string; attached: readonly string[] }> = [];
  const suggest = async (request: string, attached: readonly string[]) => {
    asked.push({ request, attached });
    return [SUGGESTED_SKILL];
  };
  return { suggest, asked };
}
