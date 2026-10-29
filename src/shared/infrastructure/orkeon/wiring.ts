// The adapters bound to the runtime's `tools` global, and the session and config
// services built over them, for the entry points to wire into the application
// (the commands' _lib takes them as parameters). The only module of this folder
// that imports globals.ts:
// the adapters themselves take the tools as a parameter, so their tests run them
// over tests/support/fake-tools.ts. The CrewHost adapter (crew-host.ts) is not
// here: it reads the command context, which each command receives, not a global;
// nor are the Llm (llm.ts) and RunState (run-state.ts) adapters, which read the
// context each agent body receives. The tool catalogue reads both: the `tools`
// global for the calls, the context's `tools` service for the registered names.
//
// Each factory takes the tools it calls, the global by default: an agent body that may run beside others (a
// parallel /dev-batches) passes its own `ctx.tools`, held to its working root, since the global refuses a call
// from code while agents with different roots run. The file, shell and config ports also take that root, to
// keep naming the checkout `/workspace` (shared/domain/dev/path-rebase.ts). `Rag` stays the global: its
// namespace is not a tool call and is never refused.

import type {
  AnchorIndex, Clock, CodeIndex, CostIndex, Files, HumanInput, Llm, Logger, MemoryStore, Progress, SessionStore,
  SharedMemory, Shell, ShellJobs, Telemetry, ToolCatalogue,
} from "../../application/ports.ts";
import type { CompactDeps } from "../../application/compaction/compact-session.ts";
import { writeWorkflowState } from "../../application/workflow/workflow-state.ts";
import { createConfigStore } from "../../application/config-store.ts";
import type { ConfigStore } from "../../application/config-store.ts";
import { createSessionIo } from "../../application/session-io.ts";
import type { SessionIo } from "../../application/session-io.ts";
import type { ServiceLocator } from "../../../commands/.orkeon/orkeon-cli.d.ts";
import { AgentBuilder, Llm as HostLlm, Rag, Tools, inputs } from "../globals.ts";
import { profiledAgent } from "./llm-profile.ts";
import type { AgentFactories } from "./llm-profile.ts";
import { createAnchorIndex, createCodeIndex, createCostIndex } from "./code-index.ts";
import { createFiles } from "./files.ts";
import { createHumanInput } from "./human-input.ts";
import { createMemoryStore } from "./memory-store.ts";
import { createProgress } from "./progress.ts";
import { createSessionStore } from "./session-store.ts";
import { createShell } from "./shell.ts";
import { createShellJobs } from "./shell-jobs.ts";
import { createTelemetry } from "./telemetry.ts";
import { createGitHubPullRequests } from "./github-pull-requests.ts";
import { createPullRequestOpener } from "../../application/git/open-pull-request.ts";
import type { PullRequestPolicy } from "../../application/git/open-pull-request.ts";
import type { PullRequestOpener } from "../../application/git/commit-files.ts";
import { createToolCalls, createToolCatalogue } from "./tool-catalogue.ts";
import type { MemoryToolPorts } from "./memory-tools.ts";
import { createSharedMemory } from "./shared-memory.ts";

/** The system clock: the one place the time is read, handed to the application as its Clock port. */
export const orkeonClock = (): Clock => () => new Date();

export const orkeonShell = (tools: OrkeonTools = Tools, root?: string): Shell => createShell(tools, root);
export const orkeonShellJobs = (tools: OrkeonTools = Tools, root?: string): ShellJobs => createShellJobs(tools, root);
export const orkeonFiles = (tools: OrkeonTools = Tools, root?: string): Files => createFiles(tools, root);
export const orkeonProgress = (tools: OrkeonTools = Tools): Progress => createProgress(tools);
export const orkeonTelemetry = (tools: OrkeonTools = Tools): Telemetry => createTelemetry(tools);
export const orkeonMemoryStore = (tools: OrkeonTools = Tools): MemoryStore => createMemoryStore(tools);
export const orkeonCodeIndex = (tools: OrkeonTools = Tools): CodeIndex => createCodeIndex(tools);
export const orkeonAnchorIndex = (tools: OrkeonTools = Tools): AnchorIndex => createAnchorIndex(tools);
export const orkeonCostIndex = (tools: OrkeonTools = Tools): CostIndex => createCostIndex(tools);
/** The shared memory's RAG index: the `rag` namespace, else the rag tools. */
export const orkeonSharedMemory = (tools: OrkeonTools = Tools): SharedMemory => createSharedMemory(Rag, tools);
/** What memory_recall and memory_push call, built when the model calls one. */
export const orkeonMemoryToolPorts = (tools: OrkeonTools = Tools, root?: string): MemoryToolPorts => ({
  files: orkeonFiles(tools, root), shell: orkeonShell(tools, root), config: orkeonConfigStore(tools, root),
  memory: orkeonSharedMemory(tools), clock: orkeonClock(),
});
/** human_input: a question to the person at the terminal, never answered on their behalf. */
export const orkeonHumanInput = (tools: OrkeonTools = Tools): HumanInput => createHumanInput(tools);
/** The pull request opened with the github tool, under the session's mode and rules (W0-C). */
export const orkeonPullRequestOpener = (policy: PullRequestPolicy, tools: OrkeonTools = Tools): PullRequestOpener =>
  createPullRequestOpener({ shell: orkeonShell(tools), github: createGitHubPullRequests(tools) }, policy);
/** The registered tools: built in a handler, from the `ctx.services` it receives. */
export const orkeonToolCatalogue = (services: Pick<ServiceLocator, "get">): ToolCatalogue =>
  createToolCatalogue(Tools, services);

/** The calls alone, by registered name: for a crew, which gets no `tools` service. */
export const orkeonToolCalls = (tools: OrkeonTools = Tools): Pick<ToolCatalogue, "call" | "callText"> =>
  createToolCalls(tools);
const orkeonSessionStore = (tools: OrkeonTools = Tools): SessionStore => createSessionStore(tools);

/** The /config store: the settings file, overridden by the session bag. */
export const orkeonConfigStore = (tools: OrkeonTools = Tools, root?: string): ConfigStore =>
  createConfigStore({ files: orkeonFiles(tools, root), session: orkeonSessionStore(tools) });

/** The session's buffer, state and budget, and its permission mode. */
export const orkeonSessionIo = (tools: OrkeonTools = Tools): SessionIo =>
  createSessionIo({ store: orkeonSessionStore(tools), config: orkeonConfigStore(tools) });

/** The compaction pipeline's ports, for /compact and the main loop's automatic compaction alike: the running
 *  agent's model and log, and step 0 writing the state file of the dev batch in progress. */
export const orkeonCompactionDeps = (
  ctx: { llm: Llm; log: Logger },
  ports: {
    session: SessionStore; files: Files; memory: MemoryStore; progress: Progress; shell: Shell;
    config: Pick<ConfigStore, "readValue">;
  },
  clock: Clock,
): CompactDeps => {
  const { session, files, memory, progress, shell, config } = ports;
  return {
    progress, session, files, memory, llm: ctx.llm, log: ctx.log,
    workflow: (trigger) => writeWorkflowState({ session, files, shell, config, clock }, trigger),
  };
};

/** The runtime's agent factories: `agentBuilder` and `llm.profile`, the latter absent where the host declares no `llm`. */
export const orkeonAgentFactories = (): AgentFactories => {
  const host = HostLlm;
  return { agent: AgentBuilder, profile: host === undefined ? undefined : (name) => host.profile(name) };
};

/** An agent builder on the profile the crew input names (`llmProfile`, the session's `llm.profile`), else the plain
 *  one: where every composition root starts an agent (orkeon/llm-profile.ts). */
export const orkeonAgent = (input: Readonly<Record<string, unknown>> = inputs()): any => profiledAgent(input, orkeonAgentFactories());
