// The text the status commands show the user (ADR 0026): the rows of /doctor and /status, the /usage legend and
// breakdown, the release notes.
import { CLI_BUILD, CLI_NAME, CLI_VERSION, ORKEON_RUNTIME_PIN } from "./meta.ts";

// /doctor

export const versionNoRuntime = (code: string): string =>
  `${code}; Orkeon expected at commit ${ORKEON_RUNTIME_PIN} (.orkeon-version), the host names no runtime: ` +
  "orkeon-code --version in a terminal says the one found";
export const versionPinned = (code: string, found: string): string => `${code}; ${found}, the pin of .orkeon-version`;
export const versionNotPinned = (code: string, found: string): string =>
  `${code}; ${found} runs, commit ${ORKEON_RUNTIME_PIN} expected (.orkeon-version): ` +
  "the commands were checked against the pin";
export const CHECK_LLM_MODEL = "llm: model configured";
export const modelNotPinged = (model: string): string => `${model} (not pinged — a reachability test costs a real call)`;
export const NO_MODEL =
  "the host reports NO model: expect every /assistant turn to no-op. Check the `Llm` section of the settings file.";
export const CHECK_LLM_CATALOGUE = "llm: declared catalogue";
export const NO_AVAILABLE_MODELS = "no Llm:AvailableModels — /model cannot offer a choice or flag an unserved name";
export const essentialsPresent = (registered: number, essentials: number): string =>
  `${registered} registered, all ${essentials} essentials present`;
export const CHECK_CODE_INTEL = "tools: code intelligence";
export const codeIntelAbsent = (tools: readonly string[]): string =>
  `absent: ${tools.join(", ")} — the agent falls back to reading files`;
export const workspaceNotWritable = (workspace: string): string => `  ← ${workspace} is missing or not writable`;
export const NO_PATH_LIST = "no path list";
export const CHECK_SESSIONS = "sessions: outside the project";
export const oldSessionsLeft = (dir: string): string =>
  `${dir} holds sessions of an older start, left alone: sessions now live in the launcher's state folder, outside the project ` +
  "(orkeon-code --resume lists them); delete the folder once you no longer need it";
export const projectSettingIgnored = (key: string, value: string, reason: string): string =>
  `the project file sets ${key} '${value}': ignored, ${reason}`;
export const CHECK_PROJECT_FILE = "settings: project file";
export const checksFailed = (failed: number, warned: number): string =>
  `${failed} check(s) FAILED, ${warned} warning(s) — the host is not fully usable.`;
export const checksPassedWarned = (warned: number): string => `all checks passed, ${warned} warning(s).`;
export const ALL_CHECKS_PASSED = "all checks passed.";

// /status

export const RUNTIME_PIN_ONLY = `Orkeon ${ORKEON_RUNTIME_PIN} (the commit pinned by .orkeon-version)`;
export const runtimePinned = (found: string): string => `${found}, the pin of .orkeon-version`;
export const runtimeNotPinned = (found: string): string => `${found}, NOT the pin ${ORKEON_RUNTIME_PIN} of .orkeon-version`;

/** How Orkeon Code is updated: there is no self-update channel. */
export const UPDATE_NOTE =
  "no self-update: update the orkeon-code checkout (git pull, or a newer release archive) and relaunch; " +
  "the Orkeon runtime it runs on is pinned to a commit of Orkeon's main by its .orkeon-version";
export const MODEL_UNREPORTED = "(unreported by the host — see /model)";
export const hostDefaultProvider = (provider: string): string => `${provider} (the host's default)`;
export const UNREPORTED_BY_HOST = "(unreported by the host)";

// /usage

/** What a host without the usage service leaves the breakdown with. */
export const NO_USAGE_SERVICE = "usage by model and command: not reported by this host (no usage service)";
export const unpricedCalls = (count: number): string => `${count} call(s) unpriced: the cost is a lower bound`;
export const fromCache = (tokens: number): string => ` (${tokens} from the cache)`;
export const NO_MODEL_USAGE = "by model: none named by the provider yet";
export const NO_COMMAND_USAGE = "by command: no command instance yet";

/** What the row's columns count, and which are estimates: the closing text opens with it. */
export const USAGE_LEGEND = [
  "usedTokens, estTokens: the conversation's size in the context window, estimated by the host.",
  "llm*: counted by the providers over every call: llmInTokens sent, llmOutTokens received (llmReasoningTokens a part of",
  "them), llmTokens = in + out. cacheRead and cacheWrite are parts of llmInTokens; cacheRatio = cacheRead / llmInTokens.",
  "n/a: not reported, never a measured 0.",
].join("\n");

/** What a sub-verb /usage does not know answers. */
export const USAGE_SYNTAX = "usage: /usage, or /usage tools [text] (the tool calls of this session's turns)";

export const NO_TOOL_TRACE = "no tool call recorded in this session yet";
export const noToolCallHolds = (text: string): string => `no tool call holds '${text}' in this session`;

// /release-notes

export const RELEASE_NOTES = [
  `${CLI_NAME} ${CLI_VERSION} (${CLI_BUILD})`,
  "",
  `First release candidate of 1.0.0, on Orkeon main ${ORKEON_RUNTIME_PIN}.`,
  "",
  "Crews: main-loop (the interactive loop behind /assistant), code-review, git-commit,",
  "       project-init, init-verifiers, session-compact, advisor, analyze, speech,",
  "       dev-verify, dev-learn, dev-plan, dev-spec, dev-change, dev-implement, dev-batches,",
  "       shared-memory-admit, agent-run.",
  "Commands: 49 slash commands; free text without a leading / goes to /assistant.",
  "Permissions: five modes (default, acceptEdits, plan, dontAsk, bypassPermissions),",
  "             deny/allow rules (argument patterns too) enforced by the host gate,",
  "             questions before writes and commands, /mode for the session default.",
  "Extra tools: tools.extra offers an MCP server's or a plugin's tools to the assistant.",
  "Speech: the MCP server of mcp/whisper, /transcribe [--then], /voice (dictation), /say (read aloud).",
  "Context: automatic compaction with a persistent breaker, snip-first /compact,",
  "         file restore after compaction, context pressure tiers.",
  "Models: /model switches the model per turn; /model list offers Llm:AvailableModels.",
  "Code intelligence: index, maps, dependency graph and symbol tools of the Orkeon runtime.",
].join("\n");
