// The ports: what the application layer needs from outside, named after that need
// rather than after the runtime that provides it. Interfaces only, so this module
// is erased from every bundle. The Orkeon adapters live in
// shared/infrastructure/orkeon/ (and are wired by entry points), the test doubles
// in tests/support/.

import type { SessionMsg } from "../domain/types.ts";
import type { PermissionRule } from "../domain/agent-policy/permission.ts";
import type { AccessCostReport } from "../domain/dev/access-cost.ts";
import type {
  GraphSummary, ImpactSummary, IndexSummary, MapEntry, PackageSummary,
} from "../domain/code-intel-contract.ts";

/** The outcome of one shell command. */
export interface ShellResult {
  stdout: string;
  stderr: string;
  /** -1 when the runtime reported none. */
  exitCode: number;
  /** True when the runtime stopped the command at its timeout; absent otherwise. */
  timedOut?: boolean;
}

/** How one command runs. */
export interface ShellOptions {
  /** Whole seconds before the runtime stops the command; the runtime's default when absent. */
  timeoutSeconds?: number;
}

/** Runs shell commands in the project's working directory, /workspace. A command
 *  the runtime refuses or cannot run throws; a failing one returns its exit code. */
export interface Shell {
  run(command: string, options?: ShellOptions): Promise<ShellResult>;
}

/** Where a detached job stands: running, or exited with its code (-1 when it ended without one). */
export interface ShellJobStatus { running: boolean; exitCode: number }

/** Commands run detached (the runtime's shell jobs): a long suite outlives no shell timeout, its whole
 *  output goes to a log file, and the caller reads its tail. A job belongs to the running crew and is
 *  stopped when the crew's run ends. A call the runtime refuses throws. */
export interface ShellJobs {
  /** Starts `command` in /workspace; its id and the virtual path of its log. */
  start(command: string): Promise<{ id: string; log: string }>;
  status(id: string): Promise<ShellJobStatus>;
  /** The last `lines` lines of the job's log (500 at most). */
  tail(id: string, lines: number): Promise<string>;
  /** Waits about `seconds` (code has no timer of its own); false when it cannot wait here. */
  wait(seconds: number): Promise<boolean>;
}

/** One VFS mount: its virtual path, and its access as the host spells it (`ro`, `rw`, `rwnd`). */
export interface Mount {
  path: string;
  /** Undefined when the host reports none. */
  rights?: string;
}

/** Files by virtual path (/workspace, /output, /tmp). A read that fails throws,
 *  with the runtime's own message (an absent file says "not found"). */
export interface Files {
  /** The file's content, its first `maxLength` characters when given. */
  read(path: string, maxLength?: number): Promise<string>;
  write(path: string, content: string): Promise<void>;
  /** The names of a directory's entries, files and directories, at most `maxEntries`. */
  list(path: string, maxEntries: number): Promise<string[]>;
  /** The VFS mounts. Throws when the host cannot list them. */
  mounts(): Promise<Mount[]>;
}

export interface ProgressSpec {
  /** Headline of the operation, e.g. "Compacting conversation". */
  label: string;
  /** Current step (1-based) for step-wise operations. */
  step?: number;
  /** Total step count, when known. */
  total?: number;
  /** Completion ratio in [0, 100]. */
  percent?: number;
  /** Current-phase line, e.g. "extracting memories". */
  message?: string;
}

/** The host's progress line. Best effort by contract: progress is decoration, so
 *  neither call ever throws, and a host without a progress channel ignores both. */
export interface Progress {
  report(spec: ProgressSpec): Promise<void>;
  /** Release the progress slot of `label`. */
  done(label: string): Promise<void>;
}

/** A conversation-buffer entry as the session holds it. Its field casing is the
 *  runtime's, so it is read through `SessionMessages.messages`; written back as
 *  read, it stays untouched. */
export type StoredMessage = unknown;

/** The conversation buffer, read once. */
export interface SessionMessages {
  /** Each entry as stored, in order. */
  stored: StoredMessage[];
  /** The same entries, as role and content. */
  messages: SessionMsg[];
}

/** Tokens used in the context window, and the window's size. */
export interface TokenBudget {
  used: number;
  window: number;
}

/** What a snip of the conversation buffer removed and kept, in entries. */
export interface SnipResult {
  removed: number;
  retained: number;
}

/** The session: its conversation buffer, its state bag (string values that survive
 *  crew runs and are cleared by /clear), the context window's budget and
 *  the session's title. */
export interface SessionStore {
  readMessages(): Promise<SessionMessages>;
  /** Replace the conversation buffer. */
  writeMessages(messages: readonly StoredMessage[]): Promise<void>;
  /** Empty the conversation buffer; resolves to how many entries it removed. */
  reset(): Promise<number>;
  /** Cut the buffer down to its head and its last `retain` exchanges. */
  snip(retain: number): Promise<SnipResult>;
  setTitle(title: string): Promise<void>;
  /** A state value; null when unset. */
  readState(key: string): Promise<string | null>;
  /** Set a state value; null removes the key. */
  writeState(key: string, value: string | null): Promise<void>;
  readBudget(): Promise<TokenBudget>;
}

/** What the host reports about the session. A field it did not report is undefined. */
export interface SessionMetadata {
  title?: string;
  /** The model the host booted with. */
  model?: string;
  messageCount?: number;
  estimatedTokens?: number;
  /** The models the host declares (`Llm:AvailableModels`), trimmed and deduplicated. */
  availableModels?: string[];
}

/** The session's cumulative LLM usage. */
export interface SessionCost {
  costUsd?: number;
  totalTokens?: number;
  totalCalls?: number;
}

/** The session's telemetry: its LLM usage plus the buffer's counters. */
export interface SessionStats extends SessionCost {
  messageCount?: number;
  estimatedTokens?: number;
  /** Prompt tokens read from the provider's cache (the hits), over every model, when the host reports them. */
  cacheHitTokens?: number;
  /** Prompt tokens written to the provider's cache, over every model, when the host reports them. */
  cacheWriteTokens?: number;
}

/** The host's account of the session. Each read throws when the host cannot
 *  answer it; callers that only display a value catch and show what they have. */
export interface Telemetry {
  readMetadata(): Promise<SessionMetadata>;
  readCost(): Promise<SessionCost>;
  readStats(): Promise<SessionStats>;
}

/** A typed-memory entry as listed. */
export interface MemoryEntry {
  /** The id /memory get and delete take; undefined when the host reports none. */
  id?: number;
  /** Undefined when the host reports none. */
  category?: string;
  content: string;
}

/** Typed memory (user, project, feedback, reference), which outlives compaction.
 *  Every call throws when the store cannot answer. */
export interface MemoryStore {
  /** The entries of one category, or of every category when none is named, in stored order. */
  list(category?: string): Promise<MemoryEntry[]>;
  /** Store an entry; resolves to its id as the host reports it, as text (`null` or
   *  `undefined` when it reports none): /memory add prints it as is. */
  add(category: string, content: string): Promise<string>;
  /** The entry `id` as the host reports it, its own field casing included (/memory get
   *  prints it verbatim), else the host's error; undefined when it reports neither. */
  get(id: number): Promise<unknown>;
  /** Delete the entry `id`; false when the host does not report a success. */
  remove(id: number): Promise<boolean>;
}

/** The tools the host registers, by the names it registers them under (`file_read`,
 *  an MCP server's `get-file-contents` or `listIssues`): a diagnostic view and the
 *  check of the extra tools, apart from the catalogue a mode hands the model
 *  (shared/domain/agent-policy). Orkeon matches a tool name case-insensitively (an
 *  agent's `.tools([...])`, the gate's rules), and so does `find`. */
export interface ToolCatalogue {
  /** Every registered name, as registered, sorted. */
  names(): string[];
  /** The registered name `name` designates, compared case-insensitively; undefined
   *  when the host registers no such tool. */
  find(name: string): string | undefined;
  /** Call the tool `name` designates with `args` as given; resolves to its raw
   *  result, throws its failure, or that no registered tool answers to `name`. */
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** The crews the host can run, by name. */
export interface CrewHost {
  /** The discovered crew names; empty when the host lists none or cannot list them. */
  listCrews(): string[];
  /** Start a crew and return its ticket at once: the completion reaches the async
   *  command's `completed`. Throws when the host cannot run crews. */
  launch(name: string, input: Record<string, unknown>): string;
}

/** The session rules of the host's permission gate, which it reads at every tool
 *  call before the mode: a deny refuses a matching call in every mode, an allow
 *  lets it run without asking in every mode but `plan`. The host keeps them until
 *  it exits, and removes them only all at once. */
export interface PermissionRules {
  /** Whether the host keeps session rules (orkeon-repl does). When it does not,
   *  the gate decides from the mode alone and every other call throws. */
  available(): boolean;
  /** Whether the host's gate is on (`Orkeon:Security:PermissionGate:Enabled`): false, no rule
   *  and no mode is enforced; undefined when the host keeps no session rules. */
  enabled(): boolean | undefined;
  /** Put a rule in force; a rule already in force is kept once. */
  add(rule: PermissionRule): void;
  /** Remove every rule. */
  clear(): void;
  /** The rules in force, one line each: `allow shell_command command=npm test*`. */
  list(): string[];
}

/** What one model call may change, for that call only. */
export interface ModelOverride {
  /** The model to answer with; the host's provider keeps its credentials and
   *  endpoint. Empty or absent: the model the host booted with. */
  model?: string;
}

/** The settings of one completion. */
export interface CompleteRequest extends ModelOverride {
  /** The system message the completion starts with, the prompt then being the user
   *  message: a crew's instructions at system authority, its material (a diff, a
   *  transcript, an answer under review) as the user's. Absent: the prompt alone. */
  system?: string;
}

/** The settings of one agentic call. */
export interface ActRequest extends ModelOverride {
  /** The system message the conversation starts with. */
  system?: string;
  /** Tool-call iterations granted; the runtime's default when absent. */
  maxIterations?: number;
  /** The mode the host's permission gate applies to each tool call. */
  permissionMode?: string;
  /** The provider's thinking at this level (`act({effort})`); none when absent. */
  effort?: "low" | "medium" | "high";
  /** The agent's tools offered for this call (a role's subset); all of them when absent. */
  tools?: readonly string[];
}

/** The model, as the crews call it. Every call throws when the host's provider
 *  fails; a failed `act` or `complete` throws an LlmFailure (shared/domain/llm-failure.ts). */
export interface Llm {
  /** The model ⇄ tool-call loop over the running agent's tools, under the crew's
   *  budget; resolves to the final answer's text. */
  act(prompt: string, request: ActRequest): Promise<string>;
  /** One completion, without tools; with `request.system`, a system message first. */
  complete(prompt: string, request?: CompleteRequest): Promise<string>;
  /** A JSON answer shaped by `schema`; throws when the reply does not parse. */
  extract(prompt: string, schema: object): Promise<unknown>;
  /** Whether the host's permission gate checks the tool calls of `act`: false, the mode and the
   *  session's rules check nothing; undefined when the facade does not say (a test's). */
  permissionGateEnabled(): boolean | undefined;
}

/** The children of the running crew (A-3): one background agent per call, its reply left in the crew's
 *  memory, its instance listed, stopped and sent to by id (`crew.instances()`, `stop`, `send`). */
export interface ChildRuntime {
  /** Starts `agent`, an agent of the crew, as a background child with `input`; throws when the host refuses. */
  spawn(agent: string, input: string): void;
  /** The crew's kept instances, oldest first. */
  instances(): ReadonlyArray<{ id: string; agent: string; state: string }>;
  /** Cancels a running instance; false when none runs under `id`. */
  stop(id: string): boolean;
  /** What a child left under `key` in the crew's memory; undefined until it does. */
  read(key: string): Promise<unknown>;
  /** Waits about `ms` milliseconds. */
  pause(ms: number): Promise<void>;
}

/** A question to the person at the terminal (`human_input`). Each call says whether a person answered: an
 *  unattended host answers on nobody's behalf, and that answer is never taken (`answered: false`). */
export interface HumanInput {
  /** One of `options`, the first one recommended; `value` is the option picked. */
  choice(prompt: string, options: readonly string[]): Promise<{ answered: true; value: string } | { answered: false }>;
  /** Free text; an empty answer is no answer. */
  text(prompt: string): Promise<{ answered: true; value: string } | { answered: false }>;
  /** Several of `options`, none recommended: the options picked, in the order given. */
  multi(prompt: string, options: readonly string[]): Promise<{ answered: true; values: string[] } | { answered: false }>;
}

/** The running crew's log. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

/** The running agent's own state: it lasts one crew run, where the session's
 *  state bag outlives it. */
export interface RunState {
  /** A field as stored; undefined when the run holds none. */
  read(field: string): unknown;
  /** Replace one field, keeping the others. */
  write(field: string, value: unknown): Promise<void>;
}

/** The running crew's own key/value memory, which its agents share for one run. */
export interface CrewMemory {
  /** Keep `value` under `key`, replacing what the key held. Throws when the host cannot store it. */
  store(key: string, value: unknown): Promise<void>;
}

/** One level of the code map: its entries, and the symbol total it reports. */
export interface CodeMap {
  entries: MapEntry[];
  symbolCount: number;
}

/** One hit of the hybrid code search. */
export interface CodeSearchHit {
  /** The symbol, e.g. "/workspace/src/math.ts::add". */
  fqn: string;
  /** A rank aggregate in hybrid mode (about 0.03): an order, not a probability. */
  score: number;
  /** Why the hit ranked: "hybrid", "vector" or "bm25". */
  origin: string;
}

/** Where a symbol lives: the file and the lines the index cites for it. */
export interface SymbolLocation {
  fqn: string;
  /** The file path as the index returns it, e.g. "/workspace/src/math.ts". */
  path: string;
  /** 1-based; 0 when the index reports none. */
  startLine: number;
  endLine: number;
  language: string;
  /** The first non-blank line of the source, trimmed, at most 160 characters. */
  firstLine: string;
}

/** The code index (RaggableTree), as /analyze harvests it and /dev-plan searches it.
 *  Each call throws when the host cannot answer it. */
export interface CodeIndex {
  /** How many roots the index holds; 0 before the first indexing. */
  rootCount(): Promise<number>;
  /** Index `root`, and count what the index then holds. */
  index(root: string): Promise<IndexSummary>;
  /** The map at `level`; `withMetrics` asks for the per-symbol metrics. */
  map(level: string, withMetrics: boolean): Promise<CodeMap>;
  /** The dependency graph of `scope`, at most `maxNodes` nodes, without its mermaid rendering. */
  dependencyGraph(scope: string, maxNodes: number): Promise<GraphSummary>;
  packageSummary(fqn: string): Promise<PackageSummary>;
  /** The hybrid code search: at most `topK` hits, best first. */
  search(query: string, topK: number): Promise<CodeSearchHit[]>;
  /** Where `fqn` lives: its file and lines. Throws when the index has no such symbol. */
  symbolSource(fqn: string): Promise<SymbolLocation>;
  /** The callers of `target`, `maxDepth` levels up. */
  impact(target: string, maxDepth: number): Promise<ImpactSummary>;
}

/** The closure of anchors: the FQNs they contain, and the callers and tests of them and of what
 *  they contain, distinct and sorted; `unresolved` the anchors the index does not know. */
export interface AnchorClosure {
  nodes: string[];
  unresolved: string[];
  truncated: boolean;
}

/** The anchors of the code index (`batch_anchors`), apart from CodeIndex. Throws when the host cannot answer. */
export interface AnchorIndex {
  closure(fqns: readonly string[]): Promise<AnchorClosure>;
}

/** What `/dev-verify` asks of the code index for the access cost (`index_status`, `incremental_reindex`,
 *  `access_cost`), apart from CodeIndex. Each call throws when the host cannot answer it. */
export interface CostIndex {
  /** The virtual roots the index holds; none before the first indexing. */
  roots(): Promise<string[]>;
  /** Re-parse `files` (virtual paths) under `root`; the errors the tool reports. */
  refresh(root: string, files: readonly string[]): Promise<string[]>;
  /** The access cost of the members of `files` (virtual paths): the report, or null and the tool's errors. */
  accessCost(files: readonly string[], receivers: string | undefined): Promise<{ report: AccessCostReport | null; errors: string[] }>;
}

/** A passage of the shared memory's index: the file it comes from (virtual path) and its score. */
export interface SharedHit {
  sourceId: string;
  score: number;
}

/** What an ingestion of the shared memory's index did, by source. */
export interface SharedIngest {
  added: number;
  reingested: number;
  unchanged: number;
  pruned: number;
  errors: string[];
}

/** The RAG index of the shared memory (one collection per project, `memory-<project>`); its files are read and
 *  written through Files. Each call throws when the host cannot answer it (no RAG subsystem). */
export interface SharedMemory {
  /** The best passages for `query`, one per source file, best first. */
  search(collection: string, query: string, topN: number): Promise<SharedHit[]>;
  /** Index `sources` (virtual paths or globs); `prune` drops the sources of the collection absent from them. */
  ingest(collection: string, sources: readonly string[], options: { prune: boolean }): Promise<SharedIngest>;
}
