// The deps launchCrew and launchMainLoop run over (FakeCrewHost, FakePermissionRules, a config store on FakeSessionStore
// and FakeFiles, FakeToolCatalogue, a recording log), the gate noted at launch, and the expected
// gate lines and warnings that run past a line.
import { runMode } from "./mode.ts";
import { createConfigStore } from "../../shared/application/config-store.ts";
import { createSessionIo } from "../../shared/application/session-io.ts";
import { resolveFallbackMode } from "../../shared/domain/permission-modes.ts";
import { PERMISSION_RULES_STATE_KEY } from "../../shared/domain/session-keys.ts";
import { DEFAULT_MEMORY_DIR, memoryWriteRules } from "../../shared/domain/shared-memory/layout.ts";
import { gateLine as memoryGateLine } from "../../shared/domain/agent-policy/permission.ts";
import { FakeCrewHost } from "../../../tests/support/doubles/fake-crew-host.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakeLogger } from "../../../tests/support/doubles/fake-logger.ts";
import { FakePermissionRules } from "../../../tests/support/doubles/fake-permission-rules.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../tests/support/doubles/fake-tool-catalogue.ts";
import { WORKSPACE } from "../../shared/domain/vfs.ts";

/** The built-in denies every sync adds after the session's rules: no model tool writes the memory's candidates or entries. */
const MEMORY_LINES = memoryWriteRules(DEFAULT_MEMORY_DIR).map(memoryGateLine);
export const MEMORY_GATE = MEMORY_LINES.map((line) => `add ${line}`);

/** The memory paths no model tool writes, absolute and relative. */
export const MEMORY_PATHS: readonly string[] = [
  `${WORKSPACE}/.orkeon/memory/entries/mistake/x.md`, ".orkeon/memory/entries/method/x.md",
  `${WORKSPACE}/.orkeon/memory/candidates/x.md`, ".orkeon/memory/candidates/x.md",
];

export const FALLBACK_VIA = resolveFallbackMode(undefined).explanation;

/** A log recording what launchCrew logs: each info with its data, each warning. */
export function recordingLog() {
  const logged: Array<{ message: string; data: unknown }> = [];
  const warned: string[] = [];
  const log = {
    info: (message: string, data?: object) => logged.push({ message, data }),
    warn: (message: string) => warned.push(message),
  };
  return { log, logged, warned };
}

/** launchCrew's deps over a FakeCrewHost; with `launchError`, every launch throws an error of that message. */
export function crewDeps(launchError?: string) {
  const crews = new FakeCrewHost();
  if (launchError !== undefined) {
    crews.launch = () => {
      throw new Error(launchError);
    };
  }
  const { log, logged, warned } = recordingLog();
  return { crews, deps: { crews, log }, log, logged, warned };
}

export const CHAIN_LIMIT_ERROR = "Async command chain refused at depth 9, limit 8.";

/** launchMainLoop's deps, the session holding the rules `stored`; `atLaunch.gate` is what the gate held when the crew
 *  was launched. */
export function mainLoopDeps(...stored: string[]) {
  const { log, logged, warned } = recordingLog();
  const gate = new FakePermissionRules();
  const crews = new FakeCrewHost();
  const atLaunch: { gate: string[] | null } = { gate: null };
  crews.onLaunch = () => { atLaunch.gate = [...gate.calls]; };
  const store = new FakeSessionStore();
  store.state.set(PERMISSION_RULES_STATE_KEY, JSON.stringify(stored));
  const config = createConfigStore({ files: new FakeFiles(), session: store });
  const catalogue = new FakeToolCatalogue();
  const deps = { session: createSessionIo({ store, config }), config, catalogue, crews, gate, log };
  return { gate, crews, atLaunch, logged, warned, store, config, catalogue, deps };
}

/** A config store over `store` whose settings file cannot be read. */
export function unreadableFileConfig(store: FakeSessionStore) {
  const files = new FakeFiles();
  files.readErrors.set(`${WORKSPACE}/.orkeon/config.json`, new Error("permission denied"));
  return createConfigStore({ files, session: store });
}

export const START_SCRIPT = { script: "/tmp/orkeon-code/session-start.sh", lines: ["a", "b"] };

export const UNREADABLE_EXTRA_TOOLS_WARNINGS = [
  `tools.extra could not be read (${WORKSPACE}/.orkeon/config.json could not be read or parsed): no extra tool this turn`,
  "permission rule 'deny create_issue' is dormant: tools.extra does not list its tool, the gate does not get it",
];

/** A tools.extra with a tool registered, one not, a bad access, a second entry of a name and a built-in tool. */
export const MIXED_EXTRA_TOOLS = "transcribe_audio:read, search_issues gone_tool:read bad:exec search_issues:read file_write";

const EXTRA_ENTRY_RULE = "each entry is <name>[:read|:write], a tool that is not built in, named once";

export const MIXED_EXTRA_TOOLS_WARNINGS = [
  "extra tool 'gone_tool' is not registered by the host and is left out " +
    "(its MCP server did not connect, its plugin did not load, or the name is mistyped)",
  `tools.extra: 'bad:exec' is ignored (${EXTRA_ENTRY_RULE})`,
  `tools.extra: 'search_issues:read' is ignored (${EXTRA_ENTRY_RULE})`,
  `tools.extra: 'file_write' is ignored (${EXTRA_ENTRY_RULE})`,
  "permission rule 'deny never_configured' is dormant: tools.extra does not list its tool, the gate does not get it",
];

/** MCP names spelt in other cases and styles, one of them never registered. */
export const MCP_EXTRA_TOOLS = "Get-File-Contents:read listissues SEARCH_CODE get_file_contents";
export const MCP_REGISTERED: readonly string[] = ["get-file-contents", "listIssues", "search_code"];

export const MCP_UNREGISTERED_WARNING =
  "extra tool 'get_file_contents' is not registered by the host and is left out " +
  "(its MCP server did not connect, its plugin did not load, or the name is mistyped)";

/** A session whose voice.reply holds `value` (unset when undefined), the host registering `registered`. */
export async function voiceDeps(value: string | undefined, ...registered: string[]) {
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

export type VoiceDeps = Awaited<ReturnType<typeof voiceDeps>>;

/** The deps of `s`, their config failing every read of a value. */
export function unreadableVoiceDeps(s: VoiceDeps): VoiceDeps["deps"] {
  const config = { ...s.config, readValue: async () => { throw new Error("config.json unreadable"); } };
  return { ...s.deps, config } as VoiceDeps["deps"];
}

export const QUIET_VOICE_CASES: readonly { name: string; value: string | undefined; registered: string[] }[] = [
  { name: "adds nothing when it is off", value: "off", registered: ["speak"] },
  { name: "adds nothing when it is unset", value: undefined, registered: ["speak"] },
];

export const NO_SPEAK_WARNING =
  "voice.reply is on but the host registers no 'speak': the answer is not read aloud " +
  "(start orkeon-code with ORKEON_CODE_AUDIO_DIR and ORKEON_CODE_VOICE=1)";

export const UNREADABLE_VOICE_WARNINGS = [
  "tools.extra could not be read (config.json unreadable): no extra tool this turn",
  "voice.reply could not be read (config.json unreadable): the answer is not read aloud this turn",
];

/** A session where /mode plan was run, with the stores it holds. */
export async function planModeSession() {
  const crews = new FakeCrewHost();
  const store = new FakeSessionStore();
  const files = new FakeFiles();
  const config = createConfigStore({ files, session: store });
  const session = createSessionIo({ store, config });
  await runMode(["plan"], { session, log: new FakeLogger() });
  return { crews, files, config, session };
}

/** A sink for the lines writeCompleted writes. */
export function lineSink() {
  const lines: string[] = [];
  return { lines, out: { writeLine: (line: string) => lines.push(line) } };
}
