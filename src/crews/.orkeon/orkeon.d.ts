// Orkeon Scripting DSL v1.0 - TypeScript declarations
// Generated from src/scripting/Orkeon.Scripting/Typings/*.d.ts
// DO NOT EDIT - regenerate with `orkeon typings` (or `dotnet build src/scripting/Orkeon.Scripting` in a clone)
// Orkeon Scripting DSL — Errors module
// Loaded first because other modules reference these types.
//
// Every class below is a real global (GAP-12): `err instanceof ReceiveTimeoutError` holds for
// the error the runtime throws. They used to be declared and never planted, so that check
// compiled and threw a ReferenceError. A host failure with no class here arrives as a plain
// `Error`; every host error, classed or not, carries `clrType` (the .NET exception's type name)
// and `clr` (the exception object itself).
declare global {
/** What every error the host throws carries, whichever its class. */
interface HostError extends Error {
/** The .NET exception type name, e.g. `"ReceiveTimeoutException"`. */
readonly clrType?: string;
/** The .NET exception object. */
readonly clr?: unknown;
}
/** Thrown when the runtime cannot satisfy the version declared by a script. */
class ScriptVersionMismatchError extends Error implements HostError {
readonly declaredVersion: string;
readonly supportedVersion: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when an agent is added to a crew while it belongs to another. */
class AgentAlreadyInCrewError extends Error implements HostError {
readonly agentName: string;
readonly crewName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown by a context call (`ctx.send`, `ctx.receive`, `ctx.delegate`…) from an agent no crew holds. */
class AgentNotInCrewError extends Error implements HostError {
readonly agentName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when an agent — or an agent name — is not a member of the crew addressed. */
class AgentNotInThisCrewError extends Error implements HostError {
readonly agentName: string;
readonly crewName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown by `crew.add` when two agents share the same name. */
class DuplicateAgentNameError extends Error implements HostError {
readonly agentName: string;
readonly crewName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when an agent runs itself (`crew.runAgent`, `ctx.delegate`) or spawns its own name. */
class RecursiveAgentInvocationError extends Error implements HostError {
readonly agentName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when an awaiter on a queue is interrupted via `queue.kick()`. */
class WaiterKickedError extends Error implements HostError {
readonly queueName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when `queue.pop({ timeout })` or `ctx.receive({ timeout })` expires before a value arrives. */
class ReceiveTimeoutError extends Error implements HostError {
readonly timeoutMs: number;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when state is mutated outside a `state.with(...)` block. */
class StateMutationOutsideWithError extends Error implements HostError {
readonly propertyName: string;
readonly clrType?: string;
readonly clr?: unknown;
}
/** Thrown when an agent's execution budget is exhausted. */
class BudgetExhaustedError extends Error implements HostError {
readonly dimension: "toolCalls" | "delegationDepth" | "wallTime" | "tokens" | "spawnedAgents";
readonly clrType?: string;
readonly clr?: unknown;
}
/**
* Thrown by `ctx.llm.act` when the agent's `.tools([...])` names a tool the host does not
* offer — a typo is never run as a loop without that tool. Also thrown by the `tools` option
* of `act` for a name the agent does not hold. Names match case-insensitively.
*/
class UnknownToolError extends Error implements HostError {
/** The agent whose `.tools([...])` names them. */
readonly agentName: string;
/** The names no host tool answers to, as written. */
readonly toolNames: readonly string[];
/** The tools the host offers, by name. */
readonly availableTools: readonly string[];
readonly clrType?: string;
readonly clr?: unknown;
}
/**
* The code an `onError` handler reads on `err.code` — exactly the codes the runtime's
* mapper produces (`ErrorCodeMapper`).
*/
type ErrorCode =
| "rate_limit"
| "network"
| "timeout"
| "receive_timeout"
| "state_mutation"
| "agent_not_in_crew"
| "validation"
| "unknown";
}
export { };
// Orkeon Scripting DSL — Agent builder
// Declares Agent, AgentBuilder, the onCommand envelope, and the ErrorAction outcomes an onError handler returns.
declare global {
interface Agent<TIn = unknown, TOut = unknown> {
readonly name: string;
readonly id: string;
readonly role: string;
}
interface AgentBuilder<TIn = unknown, TOut = unknown, TState = unknown> {
name(value: string): this;
role(value: string): this;
goal(value: string): this;
backstory(value: string): this;
/**
* The model this agent runs on: `llm.default_`, `llm.model("…")` or `.with(...)` on
* either. The provider is the host's — an agent cannot pick another one. A model name or
* a `{ provider, model }` literal is refused: the runtime used to drop it without a word.
*/
llm(config: LlmConfig): this;
/**
* Forces this agent's output format on the providers that support it. Declarative shape.
* `"text"` keeps the provider default.
*/
withResponseFormat(type: ResponseFormatType): this;
/**
* Constrains this agent's output to a JSON Schema, on the providers whose API validates
* one server-side. Implies `json_schema`. `strict` defaults to true. Declarative shape.
*/
withResponseSchema(name: string, schema: JsonSchema | string, strict?: boolean): this;
allowDelegation(value: boolean): this;
/** The turns the agent may take on a task. Default 20 — YAML parity `maxIter:`. Must be 1 or more. */
maxIterations(value: number): this;
/** Turns the provider's thinking on at this effort. */
effort(level: "low" | "medium" | "high"): this;
/**
* YAML parity `maxRpm:` — the model requests this agent may make per minute, each of its
* turns on the declarative shape: the request of too many waits its turn, it never fails the
* task. Bounded too by the host's `RateLimiting:AgentRequestsPerMinute`, the stricter winning.
* Left out, no limit of its own; must be 1 or more. The procedural shape's `ctx.llm` calls are
* no agent turns: it applies none, and says so.
*/
maxRpm(value: number): this;
/** The agent's execution time limit, in whole seconds. */
maxExecutionTime(seconds: number): this;
verbose(value?: boolean): this;
/**
* YAML parity `working_root:` (RT-06) — the virtual directory the agent's file and shell tools
* (`file_*`, `node_*`, `edit_batch`, `shell_command`) stay inside, whether `ctx.llm.act(...)`
* or the body's code (`ctx.tools`, `tools`) calls them: a relative path resolves under it, a
* path outside it is refused, a command runs there. An absolute VFS path under a mount, with
* no `..`; one that is not refuses the agent's run when it starts, never at build. A child
* started by `spawn_agent` or `ctx.spawnBackground` without a root of its own runs under its
* parent's, and so does each later `crew.send` to it. Left out, the run is unrooted.
*/
workingRoot(path: string): this;
concurrency(n: number): this;
withState<S>(factory: (() => S) | S): AgentBuilder<TIn, TOut, S>;
/**
* Registers built-in tool names resolved by `IToolRegistry` at runtime.
* Mirror of YAML `tools: [...]` on an agent block. Accepts a single name or
* an array; tool instances belong to `withAutonomousTool`.
*
* @example
* agentBuilder().tools(["file_read", "count_pattern"])
*/
tools(names: string | readonly string[]): this;
/**
* A `toolBuilder()` tool this agent may call: offered to the model by the declarative
* shape and by `ctx.llm.act` alike, where its `execute` runs in the script. Built-in tools
* are named with `tools([...])`; anything that is not a built tool is refused.
*/
withAutonomousTool(tool: Tool<unknown, unknown>): this;
withAutonomousTools(tools: readonly Tool<unknown, unknown>[]): this;
body(fn: (input: TIn, ctx: AgentContext<TState>) => Promise<TOut> | TOut): this;
onError(handler: (err: ErrorContext, ctx: AgentContext<TState>) => Promise<ErrorAction> | ErrorAction): this;
onAgentStart(hook: (ctx: AgentContext<TState>) => Promise<void> | void): this;
onAgentStop(hook: (ctx: AgentContext<TState>) => Promise<void> | void): this;
/**
* Declare that this agent answers dispatched CLI commands. With one argument the handler
* answers any intent; with two, the first is the intent it answers. The handler receives
* the command envelope and returns the response payload (string) or
* `{ success?, payload, error? }`. This is the seam a `.cmd.ts` command reaches by name.
*/
onCommand(handler: (env: AgentCommandEnvelope) => AgentCommandReply): this;
onCommand(intent: string, handler: (env: AgentCommandEnvelope) => AgentCommandReply): this;
build(): Agent<TIn, TOut>;
}
/** Request envelope handed to an `onCommand` handler. */
interface AgentCommandEnvelope {
readonly intent: string;
readonly payload: string;
readonly from: string;
readonly correlationId: string;
}
/** What an `onCommand` handler may return: a payload string, an object, or a promise of either. */
type AgentCommandReply =
| string
| { success?: boolean; payload?: string; error?: string }
| Promise<string | { success?: boolean; payload?: string; error?: string }>;
// LlmConfig is declared once, in llm.d.ts, as what the `llm.*` factories return. A
// second copy lived here — mutable where the other is readonly, `model` optional where
// the other requires it — so the two merged into a global interface TypeScript refuses
// (TS2687 on all six members, TS2717 on `model`). It also documented a shape the runtime
// discards: JsCrewConfigurationAdapter.ExtractLlmConfig returns null for anything that is
// not a JsLlmConfig, so a hand-written `{ provider: "openai", model: "x" }` literal was
// silently ignored while this declaration promised it worked.
/** What an `onError` handler receives first; the failed attempt's context comes second. */
interface ErrorContext {
/** The normalized code of the failure. */
readonly code: ErrorCode;
/** The failure's message (the innermost .NET message for a host error). */
readonly message: string;
/** The .NET exception behind the failure; a script's own `throw` arrives wrapped in one. */
readonly exception: unknown;
/** 1-based number of the attempt that just failed. */
readonly attempt: number;
/** The agent whose body failed. */
readonly agent: { readonly id: string; readonly name: string };
}
// ErrorAction was declared here as a union of plain object literals
// (`{ kind: "retry"; afterMs?: number }` and friends). The runtime accepts no such
// thing: the run loop's decideAction helper (JsCrew.Run.cs) converts the handler's
// return value and keeps it only when it is a JsErrorAction instance, i.e. something the
// global `ErrorAction` factory produced — anything else becomes `fail()`. A handler
// written against the old declaration therefore compiled, ran, and silently turned every
// retry into a failed run. What follows is the surface ErrorActionBinding actually registers.
/**
* The outcome an `onError` handler returns. Opaque by design: build one with the global
* {@link ErrorAction} factory below. A plain object is treated as `ErrorAction.fail()`.
*/
interface ErrorAction {
readonly kind: "fail" | "retry" | "skip" | "fallback";
}
/** The four outcomes an `onError` handler can return. */
const ErrorAction: {
/** Give up and fail the run with the original error. */
fail(): ErrorAction;
/** Swallow the error and continue with no output for this agent. */
skip(): ErrorAction;
/** Swallow the error and use <paramref name="value" /> as the agent's output. */
fallback(value: unknown): ErrorAction;
/**
* Run the body again. `delay` is milliseconds or a duration string ("250ms", "2s");
* `max` caps the attempts, and reaching it rethrows the original error.
*/
retry(options?: { delay?: number | string; max?: number }): ErrorAction;
};
function agentBuilder<TIn = unknown, TOut = unknown, TState = unknown>(): AgentBuilder<TIn, TOut, TState>;
}
export { };
// Orkeon Scripting DSL — Execution context module
// `ExecutionContext` is the surface every agent body and hook receives.
declare global {
/**
* The run's cancellation handle.
*
* NOT a DOM `AbortSignal`, which is what this was declared as until 2026-09-07. There
* is no DOM in the Jint engine: what a script receives is a .NET `CancellationToken`
* projected through interop, so `aborted`, `addEventListener` and `throwIfAborted` are
* all `undefined`. The idiomatic `if (ctx.signal.aborted) return;` therefore compiled,
* ran, and never once fired -- the most expensive shape a wrong declaration can take.
*
* The members below are the ones that exist, CLR-cased because that is how interop
* projects them. Prefer passing the signal along to awaiting on it: `crew.run()` and
* the `llm` calls observe it for you.
*/
interface CancellationSignal {
/** True once cancellation has been requested for this run. */
readonly IsCancellationRequested: boolean;
/** False for a signal that can never be cancelled -- nothing will ever request it. */
readonly CanBeCanceled: boolean;
}
interface MemoryHit<T = unknown> {
readonly id: string;
readonly score: number;
readonly value: T;
}
interface MemoryScope {
store(key: string, value: unknown): Promise<void>;
get<T = unknown>(key: string): Promise<T | undefined>;
search<T = unknown>(query: string, k?: number): Promise<readonly MemoryHit<T>[]>;
/** Resolves to whether the key existed. */
delete(key: string): Promise<boolean>;
}
interface LlmFacade {
complete(prompt: string, opts?: LlmCallOptions): Promise<string>;
chat(messages: readonly Message[], opts?: LlmCallOptions): Promise<ChatResponse>;
/**
* Streams the completion chunk by chunk: `for await (const c of
* ctx.llm.stream(prompt))`. Takes a PROMPT, not a message array — the
* message-array form is `chat(...)`. (This signature said
* `readonly Message[]` while the runtime has always taken a string.)
*
* Per-token when the provider exposes a real SSE path; otherwise a single
* full-text chunk. A `break` releases the underlying read.
*
* Chunks are the model's VISIBLE content only. A thinking model's
* reasoning is COUNTED on the returned object, not yielded — it is not
* part of the answer, and a caller writing chunks to a file must not
* find it there.
*/
stream(prompt: string, opts?: LlmCallOptions): LlmStream;
extract<T>(prompt: string, schema: JsonSchema, opts?: LlmCallOptions): Promise<T>;
decide<T extends string>(prompt: string, choices: readonly T[], opts?: LlmCallOptions): Promise<T>;
embed(text: string | readonly string[], opts?: LlmCallOptions): Promise<readonly number[][]>;
/**
* The LLM ⇄ tool-call loop over the agent's tools: `.tools([...])` built-ins and
* `withAutonomousTool` instances. Rejects with an `UnknownToolError`, before any model
* call, when `.tools([...])` names a tool the host does not offer.
*/
act(prompt: string, opts?: ActOptions): Promise<ActResult>;
/** Cancels the in-flight and future llm calls of this context; a running `act()` resolves with `{ interrupted: true }`. */
interrupt(): void;
/** Whether `interrupt()` was requested (or the host cancelled the run). */
readonly isInterrupted: boolean;
/**
* The host's permission gate, read-only. `enabled` is false when the host registered none
* (`Orkeon:Security:PermissionGate:Enabled` is not `true`): every tool call of `act()` then
* runs unchecked, and a `permissionMode` passed to it only logs a warning.
*/
readonly permissionGate: PermissionGateState;
}
/** What `ctx.llm.permissionGate` reports. */
interface PermissionGateState {
/** Whether a permission gate checks each tool call of `act()`. */
readonly enabled: boolean;
}
/**
* The per-call options every `ctx.llm` method reads. Two settings, both PATCHING the host
* provider's configuration for this call only: the response format, and the model. There is
* no per-call provider, temperature or token cap (GAP-12: they were declared here and never
* read), and no `signal` — the call already observes the context's.
*/
interface LlmCallOptions {
responseFormat?: ResponseFormatType;
/** The per-call model: the host's provider keeps its credentials and endpoint. */
llm?: { model?: string };
/** Turns the provider's thinking on at this effort for the call. */
effort?: "low" | "medium" | "high";
}
/**
* What `ctx.llm.stream` returns: the chunk sequence, plus a side-channel for
* what the chunks cannot carry.
*
* Read `usage` and `reasoningChunks` AFTER the loop. They are deliberately
* properties rather than callbacks: a callback would have to be invoked from
* the stream's own thread, and the script engine is single-threaded — doing
* that with several streams in flight corrupts it.
*/
interface LlmStream extends AsyncIterable<string> {
/**
* Terminal token counts, or `null` when the provider reported none —
* which is NOT the same as a call that used nothing. Orkeon asks for
* usage (`stream_options.include_usage`); a provider may ignore it.
* `null` until the stream ends.
*/
readonly usage: LlmStreamUsage | null;
/**
* Reasoning deltas seen so far. Worth reading on a thinking model: while
* it reasons, the CONTENT stream emits nothing, so a working stream and a
* dead one look identical. Measured on a nine-minute call whose reasoning
* was 22 673 of its 32 627 completion tokens — most of the call. The host
* also logs progress every 200 deltas.
*/
readonly reasoningChunks: number;
}
/** Terminal usage of one streamed call, on `LlmStream.usage`. */
interface LlmStreamUsage {
readonly tokensUsed: number;
/**
* `null` when the provider reported no usage for the stream — which is not
* the same as zero. Orkeon asks for it (`stream_options.include_usage`),
* but a provider may ignore the request.
*/
readonly promptTokens: number | null;
readonly completionTokens: number | null;
readonly cacheHitTokens: number | null;
readonly model: string;
}
interface ActOptions extends LlmCallOptions {
/** Maximum number of tool-call iterations. Default: 10. `0` or `Infinity` = unlimited. */
maxIterations?: number;
/**
* `"children"`: when the model answers while background children (`ctx.spawnBackground`) are
* out, wait for their completions and take another turn, until every child has settled or
* `maxIterations` is reached. The end of the call cancels the children still running.
*/
waitFor?: "children";
/**
* System prompt seeded as the first message of the tool-call conversation.
* Wins over any `SystemMessage` set in the provider configuration (the
* conversation-level message has precedence on every provider). Omitted:
* the conversation starts with the user prompt alone, as before.
*/
system?: string;
/**
* Permission mode gating each autonomous tool call (when the host registered a
* permission gate: `ctx.llm.permissionGate.enabled`). Default: "default" (ask; denied in
* non-interactive sessions). Without a gate the mode checks nothing, and the call logs one
* warning saying so.
*/
permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
/**
* Called with each streamed content delta of the assistant turns (when the provider
* supports SSE streaming). Keep it cheap — rendering/logging only.
*/
onDelta?: (delta: string) => void;
/**
* Called before each tool call, after the permission gate allowed it. Answers `"allow"`
* (run it), `"ask"` (hand the call to the approval channel, as a default-mode edit
* would; a refusal denies), `{ deny: reason }` (block, the model reads `DENIED: <reason>`),
* `{ input }` (run with this input, gated again) or `{ context }`. A callback that throws
* denies the call with the exception message. Any other return value (nothing, `null`, a
* non-object `input`, an unknown shape) denies the call; `"ask"` without a registered
* permission gate denies too. The `act` call never rejects because of a returned value.
*/
onToolCall?: (call: { name: string; input: unknown }) =>
"allow" | "ask" | { deny: string } | { input: unknown } | { context: string }
| Promise<"allow" | "ask" | { deny: string } | { input: unknown } | { context: string }>;
/**
* Runs after each tool call, with the call and its result (the tool's JSON parsed, else
* its text). A returned `{ context }` replaces the line the model is shown for that
* result; a void return leaves it. Runs on the script's thread.
*/
onToolResult?: (call: { name: string; input: unknown }, result: unknown) =>
void | { context: string } | Promise<void | { context: string }>;
/**
* Subset of the agent's tools to offer the model for this call. A name the agent does
* not hold throws `UnknownToolError` before the model is asked. Omitted: all its tools.
*/
tools?: string[];
}
/** What `act(...)` resolves to. */
interface ActResult {
/** The model's final answer — or a marker when the loop stopped first. */
readonly output: string;
/** The turns the loop ran. */
readonly iterations: number;
/** Set when `interrupt()` stopped the loop; `output` is then `"(interrupted)"`. */
readonly interrupted?: true;
/** Set when `maxIterations` was reached without a final answer. */
readonly exhausted?: true;
/**
* Set when the token budget (`budget({ tokens })`) ran out during the loop: the act then
* made one last call that may call no tool (the loop's tools stay declared under
* `ToolMode.None`; a tool call it returns is never run), telling the model its budget was
* spent, and `output` is that answer, cut short. When that last call fails or answers nothing, the act rejects with
* `BudgetExhaustedError` instead.
*/
readonly budgetExhausted?: true;
}
interface Message {
readonly role: "system" | "user" | "assistant" | "tool";
readonly content: string;
readonly name?: string;
}
/** What `chat(...)` resolves to. A tool call is `act(...)`'s business: `chat` offers no tools. */
interface ChatResponse {
readonly content: string;
readonly tokensUsed: number;
readonly model: string;
}
interface JsonSchema {
readonly type: string;
readonly [key: string]: unknown;
}
interface ExecutionContext {
readonly llm: LlmFacade;
readonly memory: { readonly crew: MemoryScope };
readonly events: EventBroker;
/**
* The run's cancellation handle. Pass it on to `crew.run({ signal })` or an
* `llm` call; that is the whole of its intended use.
*/
readonly signal: CancellationSignal;
readonly log: Logger;
/** A read-only view of the crew this context's agent belongs to. */
readonly crew: CrewView;
/**
* Runs another agent of the crew, by object or by name, exactly as `crew.runAgent` does:
* under its own context, its semaphore and its `onError` policy. An unknown name throws
* `AgentNotInThisCrewError`; the calling agent itself, `RecursiveAgentInvocationError`.
* `opts.budget` bounds the run; `opts.charge: "crew"` also charges it to this context's budget.
*/
delegate<T = unknown>(agent: string | Agent<unknown, T>, input: unknown, opts?: DelegateOptions): Promise<T>;
/** Queues `message` for an agent of the crew, by object or by name. Synchronous. */
send(agent: string | Agent, message: unknown): void;
/** The next message for this agent. `timeout` (ms or "2s") rejects with `ReceiveTimeoutError`. */
receive<T = unknown>(options?: { timeout?: number | string }): Promise<T>;
/** Queues `message` for every other agent of the crew. Synchronous. */
broadcast(message: unknown): void;
}
/** `ctx.crew`: the crew as a context sees it — lookups and the crew-wide named lock. */
interface CrewView {
readonly name: string;
findByName(name: string): Agent | undefined;
findById(id: string): Agent | undefined;
findByRole(role: string): readonly Agent[];
has(agent: Agent | string): boolean;
/** A named lock shared by every agent of the crew. */
lock<T>(name: string, fn: () => Promise<T>): Promise<T>;
}
/**
* The agent's state, as the body sees it: a read-only view carrying the ONE mutator.
*
* Direct assignment is trapped at runtime -- `ctx.state.count = 1` throws
* `StateMutationOutsideWithException` rather than quietly working -- because
* `with()` is what serialises mutations against the agent's state mutex.
*/
type AgentState<TState> = Readonly<TState> & {
/**
* Replaces the state with what `mutate` returns, under the state mutex, and
* resolves to the new state.
*
* REPLACES, not merges: the return value becomes the whole state, so carry the
* fields you are not changing (`prev => ({ ...prev, count: prev.count + 1 })`).
* `mutate` may be async; concurrent calls queue rather than interleave.
*/
with(mutate: (prev: Readonly<TState>) => TState | Promise<TState>): Promise<Readonly<TState>>;
};
interface AgentContext<TState = unknown> extends ExecutionContext {
readonly state: AgentState<TState>;
readonly memory: { readonly agent: MemoryScope; readonly crew: MemoryScope };
/**
* The state mutator, reachable when `state` is `undefined` or `null` and therefore has no
* `with` to call: `ctx.stateWith(prev => …)` is `ctx.state.with(prev => …)`.
*/
stateWith(mutate: (prev: Readonly<TState>) => TState | Promise<TState>): Promise<Readonly<TState>>;
lock<T>(name: string, fn: () => Promise<T>): Promise<T>;
spawn<TIn, TOut>(builder: AgentBuilder<TIn, TOut, unknown>): Agent<TIn, TOut>;
/**
* Starts a crew agent as a child in the background and returns its ticket at once. Its
* completion reaches the next `ctx.llm.act` turn as a user message, `agent <name> completed: <text>`
* (`agent <name> failed: <reason>` when it fails). At most `crew.concurrency(n)` children run at once.
*/
spawnBackground(agent: string, input: string): { readonly id: number; readonly agent: string };
/** The id (`a1`…) of the agent instance this body runs as (`crew.instances()`); `undefined` outside one. */
readonly instanceId: string | undefined;
/**
* The global `tools`, called as this agent: held to its `.workingRoot(...)` however many agents
* run beside it. The global `tools` follows the open agents' root while they share one, and
* refuses a call when they do not: call `ctx.tools` from a body that runs beside others.
*/
readonly tools: OrkeonTools;
}
/** `ctx.log`: extra arguments are joined to the message by a space, objects as JSON. */
interface Logger {
debug(message: string, ...args: unknown[]): void;
info(message: string, ...args: unknown[]): void;
warn(message: string, ...args: unknown[]): void;
error(message: string, ...args: unknown[]): void;
}
}
export { };
// Orkeon Scripting DSL — Crew builder
// Declares Crew, CrewBuilder, the six process modes, and the result and stream shapes a run produces.
declare global {
type Process =
| "sequential"
| "hierarchical"
| "parallel"
| "consensual"
| "graph"
| "autonomous";
interface CrewRunOptions {
/**
* A signal obtained from `ctx.signal`. Anything else is ignored: the runner only
* honours a value that arrives as a .NET CancellationToken.
*/
signal?: CancellationSignal;
timeout?: number | string;
// No `inputs` (GAP-12): it was declared and never read. A procedural script reads the
// `inputs` global the runner plants from --inputs.
}
/**
* The budget of one delegated run: what `ctx.delegate(agent, input, opts)` takes, and
* `crew.runAgent` beside its `CrewRunOptions`. Neither key: the run has no budget, as before.
*/
interface DelegateOptions {
/**
* Bounds this run as `crewBuilder().budget(...)` bounds a crew run, with the same keys and
* values (`wallTime` in seconds, or a duration such as `"5m"`); a spent dimension ends the
* run with `BudgetExhaustedError`, and a child it spawns (`spawn_agent`, `ctx.spawnBackground`)
* derives its budget from this one. An unknown key, or a count that is not a whole number of
* 1 or more, is refused when the run opens.
*/
budget?: ExecutionBudget;
/**
* `"crew"`: what this run spends (tool calls, tokens, spawns; its wall clock runs with the
* caller's) counts against the budget of the run it is called from as well, so runs started
* at once never spend more than the crew's budget; the first budget spent ends the run. A call
* this run's own budget refuses is not charged; a child it spawns is charged too, allowed no more
* than what both budgets have left. Without `budget`, the run spends straight from the caller's.
* Refused when the caller runs under no budget. `ctx.delegate` charges its own context's budget;
* `crew.runAgent`, the one budget every open agent body runs under, and is refused when bodies
* under different budgets are open (call `ctx.delegate` from the body instead).
*/
charge?: "crew";
}
/** `crew.runAgent`'s options: `crew.run` and `crew.runStream` ignore `budget` and `charge`, a crew run spends the crew's `budget(...)`. */
interface RunAgentOptions extends CrewRunOptions, DelegateOptions { }
/**
* What `crew.run()` resolves to: exactly what the runtime serves (GAP-27). No `artifacts`:
* it was declared and always empty, so `result.artifacts.get("x")` compiled and threw.
*/
interface CrewResult {
/** The text of the last non-null agent output; `""` when no agent returned anything. */
readonly output: string;
/** One entry per agent run, in the order they ran. */
readonly tasks: readonly TaskResult[];
}
interface TaskResult {
/** The agent's name. */
readonly name: string;
/** What the agent's body returned (`null` for `undefined` or a skipped body). */
readonly output: unknown;
/** Wall time of the agent's run, every attempt included. */
readonly durationMs: number;
}
interface Crew {
readonly name: string;
/** The members, in the order they joined. */
readonly agents: readonly Agent<unknown, unknown>[];
run(opts?: CrewRunOptions): Promise<CrewResult>;
runAgent<TIn, TOut>(agent: string | Agent<TIn, TOut>, input: TIn, opts?: RunAgentOptions): Promise<TOut>;
runStream(opts?: CrewRunOptions): AsyncIterable<CrewStreamEvent>;
add(agent: Agent<unknown, unknown>): void;
remove(agent: Agent<unknown, unknown> | string): void;
has(agent: Agent<unknown, unknown> | string): boolean;
findByName(name: string): Agent<unknown, unknown> | undefined;
findById(id: string): Agent<unknown, unknown> | undefined;
findByRole(role: string): readonly Agent<unknown, unknown>[];
/** The kept agent instances (background tickets and `spawn_agent` calls), oldest first. */
instances(): { readonly id: string; readonly agent: string; readonly state: "running" | "completed" | "failed" | "stopped" }[];
/**
* One more bare act on the instance's agent, seeded with its kept transcript; resolves to the reply
* text. Refused for an unknown or evicted id, a running instance, and a spawn past the budget.
*/
send(id: string, message: string): Promise<string>;
/** Cancels a running instance at once; `false` when none runs under `id`. */
stop(id: string): boolean;
}
/**
* One step of `crew.runStream()`: the procedural shape runs agents, not tasks or a graph,
* so these are the only two events it emits. `payload` is `{ name }` on start and
* `{ name, output }` on stop; `at` is epoch milliseconds.
*/
interface CrewStreamEvent {
readonly type: "agent.start" | "agent.stop";
readonly payload: { readonly name: string; readonly output?: unknown };
readonly at: number;
}
interface CrewBuilder {
name(value: string): this;
/** The crew goal; when omitted, one is synthesized from the name. */
goal(value: string): this;
/**
* `process("graph")` runs the crew on the domain's graph strategy — a
* retry-and-route topology with a circuit breaker, tuned by `GraphConfig`,
* not a topology the script draws. To author your own nodes and edges, build a
* `stateGraph({...})` and call `.run()` on it from an agent `.body()`.
*/
process(value: Process): this;
/** A built agent (`agentBuilder()…build()`); a builder callback is refused. */
withAgent(agent: Agent<unknown, unknown>): this;
withAgents(agents: readonly Agent<unknown, unknown>[]): this;
/** A built task (`taskBuilder()…build()`); a builder callback is refused. */
withTask(task: Task<unknown, unknown>): this;
withTasks(tasks: readonly Task<unknown, unknown>[]): this;
/**
* The crew's manager, one of its agents — YAML `managerAgent:`. `process("hierarchical")`
* requires one: it assigns each task and reviews its output, on its own `.llm(...)`.
* `process("consensual")` may have one: it arbitrates the vote when the host's fallback is
* `ManagerDecision`. Neither runs a task. The four other processes have no manager agent:
* the crew is refused when it is loaded.
*/
manager(agent: Agent<unknown, unknown>): this;
/**
* The crew's budget. Declarative shape: YAML `budget:`, spent by `process("autonomous")`
* alone; another process is refused when the run adapts the crew, as YAML and `CrewBuilder`
* refuse it, and so is a limit that is not 1 or more (zero, a negative or fractional count,
* an unreadable `wallTime`). A key left out takes its default: no token cap, no wall time,
* 50 tool calls (tasks handed out), 4 delegations, 10 spawns.
* Procedural shape: bounds `await crew.run()`.
*/
budget(opts: ExecutionBudget): this;
verbose(value?: boolean): this;
/**
* YAML parity `memory: true` — the crew remembers: each run stores the result of its tasks
* and recalls the closest ones before each task, in the host's default memory store, under
* the crew's name. Off by default. Not `ctx.memory.*`, the scoped key/value stores of a run.
*/
memory(value?: boolean): this;
/**
* YAML parity `planning: true` — before the first task, a planner writes a step-by-step
* plan for each task, which the task reads in its prompt, in every process. The plan
* changes neither the order of the tasks nor who runs them. On the host's default LLM
* profile; skipped, with a warning, on the echo provider. Off by default.
*/
planning(value?: boolean): this;
/**
* YAML parity `maxRpm:` — the model requests the crew may make per minute on the declarative
* shape, all its agents and its manager together, parallel waves included: the request of too
* many waits its turn. Left out, no limit of its own; must be 1 or more. The procedural shape
* applies none, and says so.
*/
maxRpm(value: number): this;
/**
* The most children (`ctx.spawnBackground`, the `spawn_agent` tool) the crew runs at once.
* Default 4; must be 1 or more.
*/
concurrency(n: number): this;
/** The most agent instances (`crew.instances()`) the crew keeps. Default 32; the oldest ended one goes first. */
maxInstances(n: number): this;
onCrewStart(hook: (ctx: ExecutionContext) => Promise<void> | void): this;
onCrewComplete(hook: (ctx: ExecutionContext, result: CrewResult) => Promise<void> | void): this;
/** `message` is the displayed message of the failure — the innermost CLR message, or a script error's own. */
onCrewError(hook: (ctx: ExecutionContext, message: string) => Promise<void> | void): this;
build(): Crew;
}
interface ExecutionBudget {
readonly toolCalls?: number;
readonly delegationDepth?: number;
readonly wallTime?: number | string;
/**
* The most tokens the run may spend, as a running sum: the prompt plus the completion of
* every LLM call. Each call resends its whole context, so the context is counted again on
* each call, and a turn of n calls pays it about n times: this bounds neither the size of
* the conversation nor what a provider bills with its cache. When the sum reaches the limit,
* no further tool runs: `ctx.llm.act` makes one last call that may call no tool (a tool call
* it returns is never run) and resolves with `budgetExhausted: true`;
* the error says what it counted, `Token budget exhausted: <sum> tokens sent and received
* over <n> calls (limit <limit>)`. Measure: the sum of every call's prompt and completion.
*/
readonly tokens?: number;
/**
* The most tokens the run may spend with its context counted once (#224): each call's
* completion, plus the part of its prompt the provider's cache did not serve when the
* provider reports cache hits, else what the prompt grew by since the same conversation's previous call (each
* `ctx.llm.act` is its own conversation, its first call counting its whole prompt). A
* turn of n calls on a context of c tokens spends about c plus its completions, not n times
* c. A call whose provider reports no prompt and completion counts whole, as for `tokens`.
* Set alone, it leaves `tokens` uncapped; set both, the first spent ends the run. Its end is
* that of `tokens`: `ctx.llm.act` wraps up with `budgetExhausted: true`, the error's
* `dimension` is `"tokens"`, and its message starts the same, `Token budget exhausted: <n>
* context tokens (...) over <n> calls (limit <limit> contextTokens)`. Not for a declarative
* `process("autonomous")` crew, which counts the tokens of each finished task: refused there.
*/
readonly contextTokens?: number;
readonly spawnedAgents?: number;
}
function crewBuilder(): CrewBuilder;
}
export { };
// Orkeon Scripting DSL — Events, queues, topics
// Declares the event broker surface: queues, topics, published events and subscriptions.
declare global {
interface EventQueueInfo {
readonly length: number;
readonly waiters: number;
}
interface EventQueue<T = unknown> {
readonly name: string;
/** Synchronous: hands the value to the oldest waiter, or queues it. */
push(value: T): void;
/** The next value. `timeout` (ms) rejects with `ReceiveTimeoutError`; a `kick()` with `WaiterKickedError`. */
pop(options?: { timeout?: number }): Promise<T>;
/** Synchronous: the next value without removing it. */
peek(): T | undefined;
/** Synchronous: rejects every waiter with `WaiterKickedError`. */
kick(): void;
readonly length: number;
info(): EventQueueInfo;
}
interface PublishedEvent<T = unknown> {
readonly value: T;
/** How many handlers have received this event so far. */
readonly handlerCount: number;
/** How many handlers this event is delivered to: the topic's subscribers when it was published. */
readonly maxHandlers: number;
markHandled(): void;
stopPropagation(): void;
lock<R>(name: string, fn: () => Promise<R>): Promise<R>;
}
interface Subscription {
unsubscribe(): void;
}
interface EventTopicOptions {
mode?: "parallel" | "sequential";
}
interface EventTopic<T = unknown> {
readonly name: string;
readonly mode: "parallel" | "sequential";
publish(value: T): Promise<void>;
subscribe(handler: (event: PublishedEvent<T>) => Promise<void> | void): Subscription;
}
interface EventBroker {
queue<T = unknown>(name: string): EventQueue<T>;
topic<T = unknown>(name: string, opts?: EventTopicOptions): EventTopic<T>;
}
}
export { };
// Orkeon Scripting DSL - Finite state machine literal
// Declares the stateMachine() literal: states, their per-state transitions, guards and
// entry/exit hooks.
//
// This file was rewritten on 2026-09-07 against StateMachineBinding.cs and JsStateMachine.cs
// because the declaration it replaced described an API the runtime never had: a top-level
// `transitions` ARRAY of `{ from, on, to, action }`, definition-level `onEnter`/`onExit`, a
// `circuitBreaker` option, and a `run(ctx)` method. The binding reads none of those. It reads
// a per-state `transitions` OBJECT keyed by event name, whose values carry `target` (not
// `to`), and hooks named `onEntry`/`onExit` on each state; there is no `run`. A script
// written to the old declaration therefore built a machine with ZERO transitions and failed
// silently -- `send()` returns the current state unchanged when it finds no transition.
declare global {
/**
* The single argument handed to a guard and to the onEntry/onExit hooks.
* Note it carries the state, not the whole machine.
*/
interface FsmHookContext<TState extends string = string, TPayload = unknown> {
/**
* For a guard and for onExit, the state being left; for onEntry, the state entered.
*/
readonly state: TState;
/** Whatever `send()` was given as its second argument; `undefined` if it had none. */
readonly payload: TPayload | undefined;
}
interface FsmTransition<TState extends string = string, TPayload = unknown> {
/**
* Where this event leads. Validated when the literal is built: a target that is not
* a key of `states` throws `InvalidScriptException` before the machine ever runs.
*/
target: TState;
/**
* Vetoes the transition when it returns false: `send()` then returns the current
* state unchanged and neither hook fires. A rejected transition is not an error.
*/
guard?: (ctx: FsmHookContext<TState, TPayload>) => boolean | Promise<boolean>;
}
interface FsmState<TState extends string = string, TPayload = unknown> {
/**
* Keyed by EVENT NAME -- the string later passed to `send()`. A state with no
* outgoing transitions declares `{}` (or omits the key), which makes it terminal.
*/
transitions?: Record<string, FsmTransition<TState, TPayload>>;
/** Runs after the machine has entered this state. Awaited if it returns a promise. */
onEntry?: (ctx: FsmHookContext<TState, TPayload>) => void | Promise<void>;
/** Runs before the machine leaves this state, after the guard has passed. */
onExit?: (ctx: FsmHookContext<TState, TPayload>) => void | Promise<void>;
}
interface FsmDefinition<TState extends string = string, TPayload = unknown> {
name: string;
/** Must be a key of `states`; the literal is rejected at build time otherwise. */
initial: TState;
states: Record<TState, FsmState<TState, TPayload>>;
}
interface StateMachine<TState extends string = string, TPayload = unknown> {
readonly name: string;
/** The state the machine is in now. Updated by `send()`. */
readonly current: TState;
/**
* Fires an event and resolves to the state the machine ended up in -- which is the
* CURRENT state, unchanged, when the event is unknown to it or a guard refused.
* Compare the result with `current` if you need to know whether it moved.
*/
send(event: string, payload?: TPayload): Promise<TState>;
}
/**
* Builds a state machine from a literal. Rejects at build time: a missing or non-string
* `name`/`initial`, a `states` that is not an object, an `initial` that is not declared,
* a transition without a string `target`, and a `target` naming an undeclared state.
*/
function stateMachine<TState extends string, TPayload = unknown>(
def: FsmDefinition<TState, TPayload>,
): StateMachine<TState, TPayload>;
}
export { };
// Orkeon Scripting DSL - The globals the runner reads and writes
// Declares `crew`, `inputs` and `result`: the three names a script exchanges with its host.
//
// Added on 2026-09-07. These were undeclared, which is why every declarative crew in the
// repository ends with the cast `(globalThis as any).crew = crew` -- the central mechanism
// of the declarative shape was invisible to the type system. With this file the cast is
// unnecessary: `globalThis.crew = crew` type-checks, and assigning something that is not a
// Crew is now an error at authoring time instead of a message from the runner.
declare global {
/**
* The DECLARATIVE handoff. Assign a built crew here INSTEAD of calling `crew.run()`,
* and the runner drives it: tasks, `process` and the manager are honoured, and
* `orkeon run --validate` can check the definition without executing anything.
*
* The two shapes are exclusive, and the runner picks by looking for this assignment in
* the source. A script that assigns it never runs agent `.body()` functions; a script
* that awaits `crew.run()` instead never honours `withTask`. Do not do both.
*/
var crew: Crew | undefined;
/**
* What `--inputs` / `--inputs-file` parsed, planted before the script is evaluated.
* `undefined` when the run passed neither. Only the procedural shape sees it: the
* declarative handoff goes through the shared runner, which does not plant inputs.
*/
var inputs: Record<string, unknown> | undefined;
/**
* What the runner reports as the run's result. Optional: the value of the last
* expression is used when a script never assigns it. Whatever goes here is serialised
* to JSON, so assign a plain projection -- a `CrewResult` holds host objects and does
* not survive the trip.
*/
var result: unknown;
}
export { };
// Orkeon Scripting DSL - State graph literal (LangGraph-style)
// Declares the stateGraph() literal: nodes, the edge map, the START/END markers and the
// circuit-breaker budget.
//
// Rewritten on 2026-09-07 against StateGraphBinding.cs and JsStateGraph.cs. The declaration
// it replaces was wrong on four counts: `edges` was an ARRAY of `{ from, to, opts }` where
// the runtime wants an OBJECT keyed by source node; the budget was called `circuitBreaker`
// with failure-window fields where the runtime reads `graphConfig` with transition-count
// fields; `START`/`END` were `unique symbol` where the runtime plants plain strings; and
// `run`/`runStream` took a `CrewRunOptions` they never accepted. The array form fails loudly
// (its keys are indices, so no edge from START is found) rather than silently -- unlike the
// FSM declaration next door, which is why this one had not been noticed either.
declare global {
/**
* The entry pseudo-node. A plain string at runtime (`"__START__"`), not a symbol, so it
* works as a computed key: `edges: { [START]: "first-node" }`.
*/
const START: "__START__";
/** The exit pseudo-node, `"__END__"`. Used as an edge TARGET; never declare it in `nodes`. */
const END: "__END__";
/** A node id, or one of the two markers. */
type GraphNode = string;
/**
* Where an edge leads: a node id, `END`, or a function computing one from the state
* that the node just returned. A conditional edge is resolved on every traversal, so
* it is also how a cycle is expressed.
*/
type GraphEdge<TState> = GraphNode | ((state: TState) => GraphNode);
/**
* The traversal budget. Every bound is enforced per `run()`, and exceeding one throws.
* A preset sets all four at once; an explicit field written alongside it wins.
*/
interface GraphConfig {
/** Strict = 50/3/1/30 s, Default = 200/10/5/5 min, Permissive = 1000/100/50/30 min. */
circuitBreakerPreset?: "Strict" | "Default" | "Permissive";
/** Total node traversals. Default 200. */
maxTransitions?: number;
/** Traversals of any single node -- the bound that catches a tight cycle. */
maxStateVisits?: number;
/** Re-entries of an already-visited node. */
maxRetryCycles?: number;
/** Wall-clock bound; cancels the run rather than throwing on the next hop. */
maxTotalDurationSeconds?: number;
}
/** One hop, as yielded by `runStream`. */
interface GraphStreamEvent<TState = Record<string, unknown>> {
readonly fromNode: string;
/** The node just entered, or the literal `"END"` on the final hop. */
readonly toNode: string;
readonly state: TState;
}
interface StateGraphDefinition<TState = Record<string, unknown>> {
name: string;
/**
* Keyed by node id. Each node takes the current state and returns the next one;
* the return value REPLACES the state, so spread it (`{ ...s, done: true }`).
* `START` and `END` are reserved and rejected as node ids.
*/
nodes: Record<string, (state: TState) => TState | Promise<TState>>;
/**
* Keyed by SOURCE node, not a list of pairs. Must contain an entry for `[START]`,
* and END must be statically reachable from it, or the literal is rejected at
* build time. String targets are checked against `nodes` then; conditional edges
* can only be checked when they run.
*/
edges: Record<string, GraphEdge<TState>>;
graphConfig?: GraphConfig;
}
interface StateGraph<TState = Record<string, unknown>> {
readonly name: string;
/** Walks from START until END, returning the final state. */
run(state: TState): Promise<TState>;
/** The same walk, yielding one event per hop. */
runStream(state: TState): AsyncIterable<GraphStreamEvent<TState>>;
}
/**
* Builds a graph from a literal.
*
* `TState` cannot be inferred from the node bodies -- a node both takes and returns the
* state, so inference is circular -- and falls back to `Record<string, unknown>`, which
* spreads and indexes but checks nothing. Annotate the call to get real checking:
* `stateGraph<OrderState>({ ... })` then reports a node that returns the wrong shape.
*/
function stateGraph<TState = Record<string, unknown>>(
def: StateGraphDefinition<TState>,
): StateGraph<TState>;
}
export { };
// Orkeon Scripting DSL — Llm provider namespace
// Declares LlmConfig and the `llm` namespace: `llm.default_`, `llm.model(...)` and
// `llm.profile(...)`.
//
// There is no per-vendor factory (GAP-12): `llm.openai()`, `llm.anthropic()` and their six
// siblings only renamed the host's provider — `llm.anthropic()` on an OpenAI host sent
// `claude-haiku-4-5` to OpenAI. A script picks a provider the host CONFIGURED, by the name of
// one of its profiles (`Llm:Profiles:<name>`, GAP-17), and sets the model and the settings below.
declare global {
/** A provider response format, for `withResponseFormat` and the `responseFormat` options. */
type ResponseFormatType = "text" | "json_object" | "json_schema";
/**
* The model settings an agent runs with — what `llm.default_`, `llm.model(...)` and
* `with(...)` return, and the only value `agentBuilder().llm(...)` accepts.
*/
interface LlmConfig {
/** The provider this configuration talks to — the host's default one, or its profile's. Informational. */
readonly provider: string;
/** The host profile picked with `llm.profile(...)`; absent on the default profile. */
readonly profile?: string;
/**
* The model the agent runs on. Empty when the host's provider configures none: the
* agent then runs on that provider's own default model.
*/
readonly model: string;
readonly temperature?: number;
readonly maxTokens?: number;
/** Returns a copy with the given fields overridden. Any other key is refused. */
with(overrides: LlmConfigOverrides): LlmConfig;
}
/** What `LlmConfig.with(...)` and `llm.model(name, ...)` apply. */
interface LlmConfigOverrides {
model?: string;
temperature?: number;
/** A positive integer (1 to 2147483647). Omitted keeps the inherited cap; anything else throws. */
maxTokens?: number;
responseFormat?: ResponseFormatType;
}
namespace llm {
/**
* The host's provider on its own configured model — a value, not a factory. The
* `<undefined-llm>` echo (provider `"undefined"`) when the host has no provider.
*/
const default_: LlmConfig;
/** `llm.default_` on another model: `llm.default_.with({ model: name, ...overrides })`. */
function model(name: string, overrides?: Omit<LlmConfigOverrides, "model">): LlmConfig;
/**
* One of the host's named profiles (`Llm:Profiles:<name>`), on its own model unless
* `overrides.model` names another. An agent configured with it runs on that profile's
* provider — its turns and its `ctx.llm` calls. `"default"` is `llm.default_`. A name the
* host does not offer throws, listing the known profiles.
*/
function profile(name: string, overrides?: LlmConfigOverrides): LlmConfig;
}
}
export { };
// Orkeon Scripting DSL — Version directive convention
//
// Place one of these directives at the top of every `.ork.ts` file:
//
//   /// <reference orkeon-script="1.0" />
//   // @orkeon-script 1.0
//
// The second is the form `tsc` accepts: it rejects the first (TS1084) and then skips its
// semantic pass. Both are comments from TypeScript's perspective; they are parsed at runtime
// by `VersionDirectiveParser`. When the declared version is not supported by the
// host runtime, a `ScriptVersionMismatchError` is thrown before execution.
// When omitted, the runtime assumes the current default version (1.0).
export { };
// Orkeon Scripting DSL — RAG namespace (RAG-03/C3)
// First-class binding over the RAG subsystem pipelines. Requires the host to
// register the subsystem (AddOrkeonRag); calls fail with an actionable error otherwise.
declare global {
/** Incremental ingestion counters returned by `rag.ingest`. */
interface RagIngestReport {
readonly collection: string;
readonly documentsLoaded: number;
readonly chunksCreated: number;
readonly chunksEmbedded: number;
readonly chunksSkipped: number;
/** Sources ingested for the first time in this run. */
readonly sourcesAdded: number;
/** Sources skipped because unchanged since the last ingestion (0 embedding computed). */
readonly sourcesUnchanged: number;
/** Sources re-ingested (modified, or forcibly rebuilt via `reindex`). */
readonly sourcesReingested: number;
/** Sources removed because absent from the request (`prune`). */
readonly sourcesPruned: number;
readonly durationMs: number;
/** Non-fatal errors encountered during the run (empty when clean). */
readonly errors: readonly string[];
}
/** Provenance of a cited passage in a `rag.query` answer. */
interface RagCitation {
/** Citation marker number as it appears in the answer text (`[n]`). */
readonly marker: number;
readonly chunkId: string;
readonly sourceId: string;
readonly documentId?: string;
readonly snippet?: string;
readonly score: number;
}
/** Grounded answer returned by `rag.query` / passages returned by `rag.retrieve`. */
interface RagAnswer {
/** Generated answer text with `[n]` markers; ALWAYS empty from `rag.retrieve`. */
readonly text: string;
readonly citations: readonly RagCitation[];
}
/** One golden question of a `rag_eval` dataset (YAML `cases[]`). */
interface RagEvalCase {
/** Unique identifier of the case within the dataset. */
id: string;
/** Question asked to the pipeline. */
question: string;
/** Source references expected in the top-k retrieved (ground truth for recall/MRR). */
relevant?: string[];
/** Substrings the answer must contain (heuristic answer-relevance). */
expected_substrings?: string[];
/** Reference answer used by the LLM judge. */
reference_answer?: string;
/** Free tags used to filter cases in gates. */
tags?: string[];
}
/** Golden dataset read by `rag_eval` (YAML file; a bare list of cases is accepted too). */
interface RagEvalDataset {
/** Dataset name (default: the file name). */
name?: string;
/** Virtual path of the corpus ingested before the evaluation. */
corpus?: string;
/** Collection evaluated (default: derived from the dataset name). */
collection?: string;
/** The questions; at least one. */
cases: RagEvalCase[];
}
namespace rag {
/**
* Ingest sources into a collection (incremental: unchanged sources are
* skipped, 0 embedding computed). Glob patterns (`*`, `**`, `?`) are
* expanded through the virtual file system.
*/
function ingest(options: {
collection: string;
/** Virtual paths and/or glob patterns (e.g. "/workspace/docs/**//*.md"). */
sources: readonly string[] | string;
/** Chunking strategy name (recursive | sentence | structural | semantic). Pipeline default when omitted. */
chunkingStrategy?: string;
/** Force a full reindex (required after an embedding model change). Default false. */
reindex?: boolean;
/** Delete previously ingested sources absent from `sources`. Default false. */
prune?: boolean;
}): Promise<RagIngestReport>;
/**
* Ask a question against a collection; returns the grounded answer with
* citations and scores.
*/
function query(question: string, options: {
collection: string;
/**
* Retrieval profile: fast | balanced | quality | corrective | adaptive.
* Honoured per call — a pipeline is resolved for this request only,
* overriding the host-wide `Orkeon:Rag:Profile`. An unknown name is an
* error, and so is asking for a profile on a host that registered no
* `IRagProfileResolver`: silently serving the default would produce an
* answer whose provenance the caller cannot describe.
*/
profile?: string;
/** Number of chunks kept for context assembly (default 5). */
topN?: number;
}): Promise<RagAnswer>;
/**
* Same stages as `query` MINUS the generation: transform → retrieve →
* fuse → rerank → assemble, then the assembled passages come back as
* `citations` with an empty `text`. No LLM call, so no token cost.
*
* Use this whenever the caller quotes the passages rather than the
* pipeline's prose. Measured on a real run (2026-08-04): seven
* `query` calls whose generated answers were discarded by design cost
* 14 748 completion tokens and 394 s of wall time for citations that
* retrieval had already produced.
*
* Fails with a `NotSupportedException` when the resolved profile's
* executor cannot retrieve without generating (the `corrective` graph
* interleaves the two) — it does not silently fall back to `query`,
* which would charge exactly what the caller asked to avoid.
*/
function retrieve(question: string, options: {
collection: string;
/** Retrieval profile — same semantics as `query`. */
profile?: string;
/** Number of chunks kept for context assembly (default 5). */
topN?: number;
}): Promise<RagAnswer>;
}
}
export { };
// Orkeon Scripting DSL — Task builder
// Declares Task, TaskBuilder, and the deliverable contract a task can attach to its output.
declare global {
interface Task<TIn = unknown, TOut = unknown> {
readonly name: string;
readonly id: string;
readonly description: string;
readonly expectedOutput: string;
}
interface TaskBuilder<TIn = unknown, TOut = unknown> {
name(value: string): this;
description(value: string): this;
/**
* The built agent that performs this task, one of the crew's (`withAgent`): an agent the
* crew does not hold is refused when the crew is loaded.
*/
agent(agent: Agent<TIn, TOut>): this;
expectedOutput(value: string): this;
/**
* A task this one waits for and reads, one of the crew's (`withTask`): a task the crew does
* not hold is refused when the crew is loaded.
*/
withContext(task: Task<unknown, unknown>): this;
withContexts(tasks: readonly Task<unknown, unknown>[]): this;
expect(schema: JsonSchema): this;
/** Forces this task's output format (overrides the agent's). `"text"` keeps the provider default. */
withResponseFormat(type: ResponseFormatType): this;
/**
* Constrains this task's output to a JSON Schema, on the providers whose API validates
* one server-side. Implies `json_schema`. `strict` defaults to true.
*/
withResponseSchema(name: string, schema: JsonSchema | string, strict?: boolean): this;
/**
* YAML parity `llm_override: { profile }` — runs this task alone on one of the host's
* named LLM profiles (`Llm:Profiles:<name>`), on that profile's own model; its agent's
* other tasks stay where they were. `"default"` brings the task back to the host's default
* profile. A name the host does not offer fails the load, listing the known ones.
*/
withProfile(name: string): this;
/** YAML parity `humanInput: true` — the task pauses for the human-input provider. */
humanInput(value?: boolean): this;
/**
* YAML parity `asyncExecution: true` — in a `.process("sequential")` crew the task runs
* alongside the tasks after it, and a task that lists it in `withContext` waits for it.
* `.process("parallel")` accepts it without an effect of its own (a wave already runs at
* once); the four other modes refuse the crew, naming the task.
*/
asyncExecution(value?: boolean): this;
/**
* YAML parity task-level `tools:` — names, `toolBuilder()` instances, or an
* array mixing both. They ADD to the assigned agent's own tools, for this task
* only; they never replace them. Instances are registered with the runtime
* registry by the loader, so their names resolve like built-ins, and an unknown
* name fails the load under `Orkeon:CrewFactory:StrictTools` like an agent's.
*/
tools(value: string | Tool<unknown, unknown> | readonly (string | Tool<unknown, unknown>)[]): this;
/**
* First-class deliverable contract — mirror of YAML's `deliverable: { ... }`
* block. The framework writes the produced output to `path` and (when the
* source is `structured_output`) validates against the inline `schema`.
*/
deliverable(spec: TaskDeliverableSpec): this;
build(): Task<TIn, TOut>;
}
/**
* Deliverable contract for a task. `schema` (inline object) is JSON-serialized
* into `schemaInline` by the adapter — both fields are accepted, inline `schema`
* wins when both are provided.
*/
interface TaskDeliverableSpec {
path: string;
source: "final_message" | "structured_output" | "tool_call" | "none";
format?: "markdown" | "json" | "text";
sanitize?: boolean;
schemaPath?: string;
schema?: object;
schemaInline?: string;
}
function taskBuilder<TIn = unknown, TOut = unknown>(): TaskBuilder<TIn, TOut>;
}
export { };
// Orkeon Scripting DSL — Custom tool builder
// Declares Tool, ToolBuilder, and the schema shapes a script-defined tool exposes to the LLM.
declare global {
/**
* Two accepted shapes: a bare JSON schema (`{ type, properties, required }`)
* or an input/output pair. Per property, `type`, `description`, `default`,
* `enum`, `format`, `items` and `example` are all honored — the schema is
* what the LLM sees when it decides how to call the tool.
*/
type ToolSchemaSpec = JsonSchema | { input: JsonSchema; output?: JsonSchema };
interface Tool<TIn = unknown, TOut = unknown> {
readonly name: string;
readonly description: string;
/**
* Direct invocation from a script body. Returns the callback's raw
* result — a value, or a Promise to `await`. `ctx` is forwarded to the
* callback verbatim; when omitted the callback receives `undefined`.
*/
execute(input: TIn, ctx?: unknown): TOut | Promise<TOut>;
}
interface ToolBuilder<TIn = unknown, TOut = unknown> {
name(value: string): this;
description(value: string): this;
withSchema(schema: ToolSchemaSpec): this;
/**
* The tool body. When the LLM calls the tool through the orchestration
* pipeline, `ctx` is `undefined` — reach shared capabilities through the
* `tools.*` / `rag.*` globals instead. A script calling
* `myTool.execute(input, something)` forwards its own second argument.
* Under `withAutonomousTool` in `act`, the permission gate is asked once
* per model-initiated call: the `tools.*` calls made inside this body are
* not asked a second time.
*/
execute(fn: (input: TIn, ctx?: unknown) => Promise<TOut> | TOut): this;
/**
* Declared access class for permission gates. Undeclared tools are
* treated fail-closed (as writes) by gated autonomous calls: this
* declaration is the only input of the gate for a script tool (`read`
* allowed, `edit` denied in `plan` and asked in `default`).
*/
access(value: "read" | "edit" | "execute"): this;
build(): Tool<TIn, TOut>;
}
function toolBuilder<TIn = unknown, TOut = unknown>(): ToolBuilder<TIn, TOut>;
}
export { };
// Orkeon Scripting DSL — Built-in tools namespace
// Surface mirrors `IBaseTool` implementations under `Orkeon.Tools.*`; the inputs of the
// built-ins are generated into tools.generated.d.ts (#125).
declare global {
/**
* The `tools` object: every registered `IBaseTool`, reachable by name.
*
* Every built-in tool is declared in `tools.generated.d.ts` (`OrkeonBuiltInTools`, which
* this interface extends): it is written from each tool's request and response records,
* so a renamed parameter fails the type check instead of the run (#125). The e-mail and drive families
* below are written by hand, results included. A plugin or MCP tool is still reachable at
* runtime — hence the index signature, which is what forces this to be ONE interface
* rather than a namespace plus a fallback declaration.
*
* It has been wrong twice. First as an index signature written inside a `namespace`,
* which is not a declaration TypeScript accepts at all — the file did not parse, so the
* whole namespace was unavailable to every editor that loaded it. Then as a `namespace
* tools` beside a `const tools`, which do not merge either (TS2300 duplicate identifier,
* TS2395 merged declarations must be all exported or all local). Both survived because
* the only test over the shipped typings ran them through esbuild — a transpiler, which
* strips types and reports neither error. The test type-checks now.
*/
interface OrkeonTools extends OrkeonBuiltInTools {
// The e-mail family (`email_*`). Its types, and the three runtime facts they follow, are
// declared after `tools` below.
/** The accounts the operator declared: the name to pass as `account`, their rights, whether each can connect. Needs no right. */
emailAccounts(input?: Record<string, never>, ctx?: ExecutionContext): Promise<EmailAccountsResult>;
/** An account's folders, inbox first, with role and counts. Needs the Read right. */
emailFolders(input?: EmailAccountInput, ctx?: ExecutionContext): Promise<EmailFoldersResult>;
/** One page of a folder (the inbox by default), newest first; `next_cursor` fetches the next. Needs Read. */
emailSearch(input?: EmailSearchInput, ctx?: ExecutionContext): Promise<EmailSearchResult>;
/** One message: screening verdict, headers, attachments, then the body text in slices. Needs Read, plus Organize with `mark_read`. */
emailRead(input: EmailReadInput, ctx?: ExecutionContext): Promise<EmailMessage>;
/** Writes one attachment, or all of them, into a writable virtual directory. Needs Read. */
emailSaveAttachment(input: EmailSaveAttachmentInput, ctx?: ExecutionContext): Promise<EmailSaveAttachmentResult>;
/** Creates a folder (a label on Gmail) and its missing parents; `created` is false when it existed. Needs Organize. */
emailCreateFolder(input: EmailCreateFolderInput, ctx?: ExecutionContext): Promise<EmailCreateFolderResult>;
/** Renames the last segment of a folder; system folders are refused. Needs Organize. */
emailRenameFolder(input: EmailRenameFolderInput, ctx?: ExecutionContext): Promise<EmailRenameFolderResult>;
/** Moves messages to a folder path or role; `moved` gives the id each one has now. Needs Organize. */
emailMove(input: EmailMoveInput, ctx?: ExecutionContext): Promise<EmailMoveResult>;
/** Sets or clears the read (`seen`) and flagged marks. Needs Organize. */
emailMark(input: EmailMarkInput, ctx?: ExecutionContext): Promise<EmailMarkResult>;
/** Moves messages to the trash (Delete right); with `permanent: true`, deletes them for good (Purge right). */
emailDelete(input: EmailDeleteInput, ctx?: ExecutionContext): Promise<EmailDeleteResult>;
/** Saves a message in Drafts WITHOUT sending it, for a human to review and send. Needs Draft, plus Read to reply or forward. */
emailDraft(input: EmailComposeInput, ctx?: ExecutionContext): Promise<EmailDraftResult>;
/** Sends a message, only to recipients the account's `Send:AllowedRecipients` lists (none listed: refused). Needs Send, plus Read to reply or forward. */
emailSend(input: EmailComposeInput, ctx?: ExecutionContext): Promise<EmailSendResult>;
/** Parses an .eml file from a virtual path into the same result as `emailRead`. Needs no account. */
emailParser(input: EmailParserInput, ctx?: ExecutionContext): Promise<EmailMessage>;
// The drive family (`drive_*`): Google Drive and OneDrive. Its types follow the same
// runtime facts as the e-mail family's, and are declared after them below.
/** The drive accounts the operator declared: the name to pass as `account`, their rights, their root folder, whether each can connect. Needs no right. */
driveAccounts(input?: Record<string, never>, ctx?: ExecutionContext): Promise<DriveAccountsResult>;
/** One page of a folder (the account's root by default), folders first; `next_cursor` fetches the next. Needs Read. */
driveList(input?: DriveListInput, ctx?: ExecutionContext): Promise<DriveListResult>;
/** One page of the items matching the criteria, inside the account's root folder. Needs Read. */
driveSearch(input: DriveSearchInput, ctx?: ExecutionContext): Promise<DriveSearchResult>;
/** One item's metadata, its browser address included. Needs Read. */
driveInfo(input: DriveItemInput, ctx?: ExecutionContext): Promise<DriveInfoResult>;
/** A slice of a text file's (or a Google document's) text, screened; `next_offset` reads on. Needs Read. */
driveRead(input: DriveReadInput, ctx?: ExecutionContext): Promise<DriveReadResult>;
/** Saves a file (a Google document exported) into a virtual directory; never overwrites. Needs Read and a writable mount. */
driveDownload(input: DriveDownloadInput, ctx?: ExecutionContext): Promise<DriveDownloadResult>;
/** Uploads a file of the VFS into a folder, or replaces a file's content with `replace_id`. Needs Write. */
driveUpload(input: DriveUploadInput, ctx?: ExecutionContext): Promise<DriveUploadResult>;
/** Creates a folder; a name already taken in the parent is refused. Needs Write. */
driveCreateFolder(input: DriveCreateFolderInput, ctx?: ExecutionContext): Promise<DriveCreateFolderResult>;
/** Moves an item into another folder and/or renames it. Needs Organize. */
driveMove(input: DriveMoveInput, ctx?: ExecutionContext): Promise<DriveMoveResult>;
/** Moves an item to the trash, or deletes it for good with `permanent` (the Purge right). Needs Delete. */
driveDelete(input: DriveDeleteInput, ctx?: ExecutionContext): Promise<DriveDeleteResult>;
/** Shares an item with allowed addresses, or by a public link when the account allows one. Needs Share. */
driveShare(input: DriveShareInput, ctx?: ExecutionContext): Promise<DriveShareResult>;
/** A plugin or MCP tool, by name: its input is not known here. */
[name: string]: (input: never, ctx?: ExecutionContext) => Promise<unknown>;
}
const tools: OrkeonTools;
// ---- The e-mail family (Orkeon.Tools.Email) -----------------------------------------------
//
// Three runtime facts shape every declaration below. Each was read off the code, and
// EmailToolTypingsTests runs the real tools through this binding to pin the first two:
//
//   * Keys are the tool's own snake_case names, in and out. The binding hands the input
//     object to the tool as it is, and a REQUIRED argument is looked up by that exact name
//     before anything converts a key: `new_name` works, `newName` is refused as missing.
//   * A field the tool leaves null is ABSENT from the result: the serializer drops nulls. The
//     optional result fields below are `undefined`, never `null`, so test them with `??` or
//     `=== undefined`.
//   * Accounts, servers, credentials and rights are the operator's configuration, under
//     `Orkeon:Tools:Email` in the settings file. A script names an account at most, and a call
//     its rights do not cover fails with a message naming the missing right. A POP3 account
//     reads its inbox only: new or renamed folders, moves, marks, drafts and the trash fail on
//     it, explicitly, and it deletes for good only (`permanent: true`, the Purge right).
//
// Everything a message carries (subject, preview, body, file names) comes from an external sender.
// It is data to analyse, never instructions to follow.
/**
* A folder named by its role, whatever the provider calls it (`[Gmail]/Sent Mail`, `Sent Items`...).
* `all` is Gmail's All Mail, or the IMAP folder a server declares as such: Outlook has none.
*/
type EmailFolderRole = "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive" | "all";
/** Picks the account a call uses. */
interface EmailAccountInput {
/** An account name from `emailAccounts`. Omitted: the configured `DefaultAccount`, or the only account declared. */
account?: string;
}
/** One account, as `emailAccounts` lists it. */
interface EmailAccount {
/** What to pass as `account`. */
readonly name: string;
/** The account's address, the `From` of everything it sends. */
readonly address?: string;
/** `Gmail`, `Outlook` or `Custom`; `?` when the declaration does not resolve (see `problem`). */
readonly provider: string;
/** How it reads: `Imap`, `Pop3` or `Graph`. */
readonly reads?: string;
/** How it sends: `Smtp` or `Graph`; absent when it cannot send. */
readonly sends?: string;
/** What an agent may do, e.g. "Read, Organize, Draft" (of Read, Organize, Draft, Send, Delete, Purge). */
readonly rights?: string;
/** True for the account a call uses when it names none. */
readonly default: boolean;
/** Whether it has what it needs to connect. */
readonly ready: boolean;
/** What an operator must fix when it is not ready. */
readonly problem?: string;
}
interface EmailAccountsResult {
readonly accounts: readonly EmailAccount[];
/** The account a call uses when it names none; absent when every call must name one. */
readonly default_account?: string;
}
/** A folder of an account. */
interface EmailFolder {
/** Full path, `/`-separated: what `folder` and `destination` take. */
readonly path: string;
/** The last segment. */
readonly name: string;
/** Absent for an ordinary folder. */
readonly role?: EmailFolderRole;
/** Other roles that open this folder when they have none of their own: on Gmail, `archive` opens All Mail. */
readonly also_roles?: readonly EmailFolderRole[];
/** Messages in the folder, when the server says. */
readonly total?: number;
/** Unread messages, when the server says. */
readonly unread?: number;
}
interface EmailFoldersResult {
readonly account: string;
/** Inbox first. */
readonly folders: readonly EmailFolder[];
}
/** Criteria of `emailSearch`, ANDed together. */
interface EmailSearchInput extends EmailAccountInput {
/** A role, or a folder path (`emailFolders`). Default: the inbox. */
folder?: EmailFolderRole | (string & {});
unread_only?: boolean;
/** Flagged (starred) messages only. */
flagged_only?: boolean;
/** The sender's name or address contains this. */
from?: string;
/** The To header contains this (Cc is not searched). */
to?: string;
/** The subject contains this. */
subject?: string;
/** The subject or the body contains this. */
text?: string;
/** Received on or after this date: `YYYY-MM-DD` or ISO 8601 (IMAP compares whole days). */
since?: string;
/** Received before this date: `YYYY-MM-DD` or ISO 8601 (IMAP compares whole days). */
before?: string;
/** Only messages with (true) or without (false) attachments. */
has_attachments?: boolean;
/** The provider's own query language: Gmail search syntax, or KQL on Outlook. */
raw_query?: string;
/** The most messages a page may hold: 10 by default, clamped to 1..50. A page is also cut to a tool result (about 10 messages), so it can hold fewer while more follow. */
limit?: number;
/** The previous page's `next_cursor`, sent with the same criteria. */
cursor?: string;
}
/** One message of a search page. The subject and the preview are untrusted content. */
interface EmailSummary {
/** Opaque. Pass it verbatim wherever a message id goes: `id`, `ids`, `reply_to_id`, `forward_id`. */
readonly id: string;
readonly from: string;
readonly subject: string;
/** Date received, ISO 8601. */
readonly date?: string;
/** The read mark; absent over POP3. */
readonly seen?: boolean;
/** The flagged mark; absent over POP3. */
readonly flagged?: boolean;
readonly has_attachments?: boolean;
/** True when the subject or the preview looks like a prompt injection. */
readonly suspicious: boolean;
/** The first characters of the body. */
readonly preview?: string;
}
interface EmailSearchResult {
/** Reminds the reader that subjects and previews come from external senders. */
readonly notice: string;
readonly account: string;
readonly folder: string;
/** Messages on this page: not the number of matches, and possibly fewer than `limit`. */
readonly count: number;
/** Messages of the folder matching the criteria, every page counted; IMAP only, absent with `has_attachments`. */
readonly total?: number;
/** Pass it as `cursor`, with the same folder and criteria, for the next page; absent on the last one, and only then. */
readonly next_cursor?: string;
/** Newest first. */
readonly messages: readonly EmailSummary[];
}
interface EmailReadInput extends EmailAccountInput {
/** A message id exactly as `emailSearch` returned it. */
id: string;
/** Where the slice starts in the body text: the previous slice's `next_offset`. */
offset?: number;
/** Body characters to return: 2500 by default, clamped to 200..3000. */
max_chars?: number;
/** Also mark the message read; needs the Organize right. Reading alone leaves the mark as it was. */
mark_read?: boolean;
}
/** What the prompt-injection screen found in a message. */
interface EmailSecurity {
/** Always true: the content comes from an external sender. */
readonly untrusted: true;
readonly verdict: "clean" | "suspicious" | "rejected";
/** In [0, 1]. */
readonly risk_score: number;
/** The heuristics that fired. */
readonly reasons: readonly string[];
/** True when the HTML hid text from a human reader; that text is left out of `text`. */
readonly hidden_content: boolean;
/** True when the operator's screening policy withheld the body; `text` then says so. */
readonly withheld: boolean;
}
interface EmailAttachment {
/** What `emailSaveAttachment` takes as `index`. */
readonly index: number;
/** Sanitized. */
readonly file_name: string;
readonly content_type: string;
/** Approximate. */
readonly size_bytes: number;
/** True for an inline part, such as an embedded image. */
readonly inline: boolean;
}
/**
* One message, from `emailRead` or `emailParser`: notice and screening first, body last.
* Everything in it but the ids is untrusted content.
*/
interface EmailMessage {
readonly notice: string;
readonly security: EmailSecurity;
/** Absent from `emailParser`. */
readonly account?: string;
/** Absent from `emailParser`. */
readonly id?: string;
/** The folder holding the message; for `emailParser`, the file's path. */
readonly folder?: string;
readonly seen?: boolean;
readonly flagged?: boolean;
/** The RFC 5322 Message-Id. */
readonly message_id?: string;
readonly from: string;
readonly reply_to: readonly string[];
readonly to: readonly string[];
readonly cc: readonly string[];
/** ISO 8601. */
readonly date?: string;
readonly subject: string;
readonly attachments: readonly EmailAttachment[];
/** Where `text` starts in the whole body. */
readonly text_offset: number;
/** Length of the whole body text. */
readonly text_length: number;
/** Pass it as `offset` for the next slice; absent once the body is complete. */
readonly next_offset?: number;
/** This slice of the body, HTML rendered as text. */
readonly text: string;
}
interface EmailSaveAttachmentInput extends EmailAccountInput {
/** A message id exactly as `emailSearch` returned it. */
id: string;
/** A writable virtual directory, e.g. /output/attachments. */
directory: string;
/** An attachment's `index` from `emailRead`; omitted, every attachment is saved. */
index?: number;
}
interface EmailSaveAttachmentResult {
readonly account: string;
readonly id: string;
/** Under sanitized names; an existing file is never overwritten. */
readonly saved: readonly { readonly index: number; readonly file_name: string; readonly path: string }[];
}
interface EmailCreateFolderInput extends EmailAccountInput {
/** `/`-separated, e.g. "Clients/ACME"; missing parents are created too. */
path: string;
}
interface EmailCreateFolderResult {
readonly account: string;
/** False when the folder already existed. */
readonly created: boolean;
readonly folder: EmailFolder;
}
interface EmailRenameFolderInput extends EmailAccountInput {
/** The folder to rename. */
path: string;
/** Its new last segment, without `/`. */
new_name: string;
}
interface EmailRenameFolderResult {
readonly account: string;
readonly previous_path: string;
readonly folder: EmailFolder;
}
interface EmailMoveInput extends EmailAccountInput {
/** Message ids exactly as `emailSearch` returned them. */
ids: readonly string[];
/** A role or a folder path. */
destination: EmailFolderRole | (string & {});
}
interface EmailMoveResult {
readonly account: string;
readonly destination: string;
/** After a move, address a message by `new_id` (an IMAP id changes); when it is absent, search the destination. */
readonly moved: readonly { readonly id: string; readonly new_id?: string }[];
}
/** Pass `seen`, `flagged` or both. */
interface EmailMarkInput extends EmailAccountInput {
/** Message ids exactly as `emailSearch` returned them. */
ids: readonly string[];
/** true marks read, false unread; omitted, the mark is left as it is. */
seen?: boolean;
/** true flags (stars), false clears the flag; omitted, the mark is left as it is. */
flagged?: boolean;
}
interface EmailMarkResult {
readonly account: string;
/** Messages updated. */
readonly updated: number;
}
interface EmailDeleteInput extends EmailAccountInput {
/** Message ids exactly as `emailSearch` returned them. */
ids: readonly string[];
/** Delete for good instead of moving to the trash. Needs the Purge right; cannot be undone. */
permanent?: boolean;
}
interface EmailDeleteResult {
readonly account: string;
readonly deleted: number;
readonly permanent: boolean;
/** The trash folder the messages went to, when not permanent. */
readonly moved_to?: string;
/** Each deleted message; `new_id` is its id in the trash, absent when it is gone for good or when the server does not say. */
readonly messages: readonly { readonly id: string; readonly new_id?: string }[];
}
/** A new message, a reply (`reply_to_id`) or a forward (`forward_id`), for `emailDraft` and `emailSend`. */
interface EmailComposeInput extends EmailAccountInput {
/** "address" or "Name <address>". A reply defaults to the original sender. */
to?: readonly string[];
cc?: readonly string[];
bcc?: readonly string[];
/** Required for a new message; derived (Re:, Fwd:) for a reply or a forward. */
subject?: string;
/** The plain-text body. */
text?: string;
/** An HTML body; the text version is derived from it when `text` is omitted. */
html?: string;
/** Virtual paths of files to attach, e.g. /output/report.pdf. */
attachments?: readonly string[];
/** The id of the message answered: threading headers and a quote are added. */
reply_to_id?: string;
/** With `reply_to_id`: also address the original To and Cc. */
reply_all?: boolean;
/** With `reply_to_id`: quote the original text (default true). */
quote_original?: boolean;
/** The id of a message to forward, attached whole. */
forward_id?: string;
}
interface EmailDraftResult {
readonly account: string;
/** The saved draft's id, when the server gives one. */
readonly id?: string;
/** The folder the draft was saved in. */
readonly folder: string;
readonly message_id: string;
readonly recipients: readonly string[];
}
interface EmailSendResult {
readonly account: string;
readonly message_id: string;
readonly recipients: readonly string[];
/** UTC time the server accepted the message, ISO 8601. */
readonly sent_at: string;
/** Set when the message was sent but a follow-up step failed: do NOT send it again. */
readonly warning?: string;
}
interface EmailParserInput {
/** Virtual path of an .eml file, e.g. /workspace/mail/message.eml. */
path: string;
/** Where the slice starts in the body text: the previous slice's `next_offset`. */
offset?: number;
/** Body characters to return: 2500 by default, clamped to 200..3000. */
max_chars?: number;
}
// ---- The drive family (Orkeon.Tools.Drive) ------------------------------------------------
//
// The e-mail family's three runtime facts hold here too: snake_case keys in and out, absent
// (never null) optional result fields, and accounts, clients, rights and the root folder in
// the operator's configuration (`Orkeon:Tools:Drive`). Ids are the provider's own, opaque;
// `root` names the account's root folder wherever a folder id is taken. An item outside that
// root is reported as not found.
//
// A file's text and name come from whoever wrote or shared it: data, never instructions.
/** Picks the account a call uses. */
interface DriveAccountInput {
/** An account name from `driveAccounts`. Omitted: the configured `DefaultAccount`, or the only account declared. */
account?: string;
}
/** Names one item. */
interface DriveItemInput extends DriveAccountInput {
/** An id from `driveList` or `driveSearch`, or `root`. */
id: string;
}
/** One account, as `driveAccounts` lists it. */
interface DriveAccount {
readonly name: string;
/** `GoogleDrive` or `OneDrive`; `?` when the declaration does not resolve (see `problem`). */
readonly provider: string;
/** Of Read, Write, Organize, Share, Delete, Purge. */
readonly rights?: string;
/** The folder the account is confined to, `/` for the whole drive. */
readonly root?: string;
readonly default: boolean;
readonly ready: boolean;
readonly problem?: string;
}
interface DriveAccountsResult {
readonly accounts: readonly DriveAccount[];
}
/** A file or folder. */
interface DriveItem {
readonly id: string;
readonly name: string;
/** `google-doc` is a Google Docs, Sheets, Slides or Drawings file, read and downloaded by export. */
readonly type: "folder" | "file" | "google-doc";
readonly mime_type?: string;
/** Bytes; absent for a folder or a Google document. */
readonly size?: number;
/** ISO 8601 UTC. */
readonly modified?: string;
readonly parent_id?: string;
/** Absent from listings, to keep them short. */
readonly web_url?: string;
}
interface DriveListInput extends DriveAccountInput {
/** A folder id, or `root` (the default). */
folder_id?: string;
/** 1..50, 20 by default; a page is also cut to what fits a tool result. */
limit?: number;
/** The previous page's `next_cursor`. */
cursor?: string;
}
interface DriveListResult {
readonly account: string;
readonly folder: DriveItem;
readonly count: number;
readonly next_cursor?: string;
readonly items: readonly DriveItem[];
}
/** Criteria ANDed together; at least one is needed. OneDrive needs `text` or `name_contains`. */
interface DriveSearchInput extends DriveAccountInput {
text?: string;
name_contains?: string;
/** A MIME type, or a prefix ending with `/` such as `image/`. */
mime_type?: string;
kind?: "file" | "folder";
/** YYYY-MM-DD or ISO 8601. */
modified_after?: string;
folder_id?: string;
/** Google Drive only: a clause of its `q` language. */
raw_query?: string;
limit?: number;
cursor?: string;
}
interface DriveSearchResult {
readonly account: string;
readonly count: number;
readonly next_cursor?: string;
readonly items: readonly DriveItem[];
}
interface DriveInfoResult {
readonly account: string;
readonly item: DriveItem;
}
interface DriveReadInput extends DriveItemInput {
offset?: number;
/** 2500 by default, 3000 at most. */
max_chars?: number;
}
interface DriveReadResult {
readonly notice: string;
readonly security: {
readonly untrusted: boolean;
readonly verdict: "clean" | "suspicious" | "rejected";
readonly risk_score: number;
readonly reasons: readonly string[];
readonly withheld: boolean;
};
readonly account: string;
readonly id: string;
readonly name: string;
readonly total_chars: number;
readonly offset: number;
readonly next_offset?: number;
readonly text: string;
}
interface DriveDownloadInput extends DriveItemInput {
/** A virtual directory such as /output/downloads. */
directory: string;
/** Google documents only: docx, pdf, odt, txt, md, html, xlsx, ods, csv, pptx, odp, png or svg, as the kind offers. */
format?: string;
}
interface DriveDownloadResult {
readonly account: string;
readonly id: string;
/** The virtual path of the saved copy. */
readonly path: string;
readonly bytes: number;
readonly mime_type: string;
}
interface DriveUploadInput extends DriveAccountInput {
/** The virtual path of the file to upload. */
path: string;
/** The folder to upload into, `root` by default; ignored with `replace_id`. */
folder_id?: string;
/** The name in the drive; the file's own by default. */
name?: string;
/** A file whose content this upload replaces. */
replace_id?: string;
}
interface DriveUploadResult {
readonly account: string;
readonly replaced: boolean;
readonly item: DriveItem;
}
interface DriveCreateFolderInput extends DriveAccountInput {
/** `root` by default. */
parent_id?: string;
name: string;
}
interface DriveCreateFolderResult {
readonly account: string;
readonly folder: DriveItem;
}
interface DriveMoveInput extends DriveItemInput {
destination_id?: string;
new_name?: string;
}
interface DriveMoveResult {
readonly account: string;
readonly item: DriveItem;
}
interface DriveDeleteInput extends DriveItemInput {
/** Delete for good (the Purge right; a personal OneDrive refuses it). */
permanent?: boolean;
}
interface DriveDeleteResult {
readonly account: string;
readonly id: string;
readonly name: string;
readonly permanent: boolean;
}
interface DriveShareInput extends DriveItemInput {
/** Addresses on the account's share allow-list; omit with `public_link`. */
recipients?: readonly string[];
role?: "reader" | "writer";
public_link?: boolean;
/** Have the provider e-mail the recipients; false by default. */
notify?: boolean;
message?: string;
}
interface DriveShareResult {
readonly account: string;
readonly id: string;
readonly role: "reader" | "writer";
readonly recipients: readonly string[];
readonly link?: string;
}
}
export { };
// Orkeon Scripting DSL - built-in tools, GENERATED: do not edit (#125).
// Written by BuiltInToolTypings from every tool a run registers: the input from the request
// record of a ToolBase<TReq, TRes> (its JSON names, its required members), else from the
// tool's schema. Keys are the tool's own snake_case names, as the binding hands the object
// to the tool. A result is the response record's members the tool hands back, a member the
// serializer drops when null optional; `unknown` for a tool without a response record. The
// e-mail and drive families are declared by hand in tools.d.ts.
// Regenerate after a tool change:
//   ORKEON_REGENERATE_TYPINGS=1 dotnet test tests/hosting/Orkeon.Hosting.Tests/Orkeon.Hosting.Tests.csproj --no-build --filter "FullyQualifiedName~BuiltInToolTypingsTests"
declare global {
/** The built-in tools, by their camelCase name: `tools` (`OrkeonTools`) extends this. */
interface OrkeonBuiltInTools {
/** `access_cost` - Port-access cost of members, mirroring the access-cost.py script. */
accessCost(input?: {
changed_files?: readonly string[] | null;
fqns?: readonly string[] | null;
receivers?: string | null;
roots?: readonly string[] | null;
}, ctx?: ExecutionContext): Promise<{
readonly errors: readonly string[];
readonly report?: { readonly cost: { readonly lambdas: number; readonly loops: number; readonly memory_filters: number; readonly reads: number; readonly writes: number; }; readonly members: readonly { readonly cost: { readonly lambdas: number; readonly loops: number; readonly memory_filters: number; readonly reads: number; readonly writes: number; }; readonly in_memory_filters: readonly { readonly line: number; readonly method: string; }[]; readonly member: string; readonly port_calls: readonly { readonly in_lambda: boolean; readonly in_loop: boolean; readonly line: number; readonly method: string; readonly receiver: string; }[]; }[]; };
}>;
/** `affected_tests` - Test projects and classes reached through the graph by changed files. */
affectedTests(input?: {
base?: string | null;
changed_files?: readonly string[] | null;
}, ctx?: ExecutionContext): Promise<{
readonly all: boolean;
readonly test_classes: readonly string[];
readonly test_projects: readonly string[];
readonly unresolved: readonly string[];
}>;
/** `arcadedb_query` - Execute Cypher or SQL queries on ArcadeDB via Bolt protocol */
arcadedbQuery(input: {
/** Bolt protocol URI for ArcadeDB */
bolt_uri: string;
/** Target database name in ArcadeDB */
database: string;
/** Maximum number of result records to return */
max_results?: number;
/** Query parameters as key-value pairs */
parameters?: Record<string, unknown> | null;
/** Password for ArcadeDB authentication */
password?: string | null;
/** Cypher or SQL query to execute */
query: string;
/** Query language: Cypher (default) or Sql */
query_language?: string;
/** Username for ArcadeDB authentication */
username?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly execution_time_ms: number;
readonly nodes_created: number;
readonly properties_set: number;
readonly query_language: string;
readonly record_count: number;
readonly records?: readonly Record<string, unknown>[];
readonly relationships_created: number;
}>;
/** `batch_anchors` - Closure of anchors (contains, callers, tests) and overlap of two anchor sets. */
batchAnchors(input?: {
a?: Record<string, unknown> | null;
action?: string;
b?: Record<string, unknown> | null;
files?: readonly string[] | null;
fqns?: readonly string[] | null;
}, ctx?: ExecutionContext): Promise<{
readonly disjoint: boolean;
readonly nodes: readonly string[];
readonly shared: readonly string[];
readonly truncated: boolean;
readonly unresolved: readonly string[];
readonly unresolved_a: readonly string[];
readonly unresolved_b: readonly string[];
}>;
/** `cache_search` - Semantic search over content previously stored in the RAG cache (e.g. by web_scrape with cached=true). source filter scopes by producing tool; url_filter scopes by URL substring; both are optional — empty means global search. */
cacheSearch(input: {
/** Minimum cosine-similarity score (0..1) for a chunk to be returned (default 0.0) */
min_score?: number;
/** Natural-language query to search semantically against the cached content */
query: string;
/** Optional source tag filter (e.g. "web_scrape"). Empty = search all sources. */
source?: string | null;
/** Maximum number of chunks to return (default 5) */
top_k?: number;
/** Optional URL substring filter — only matches chunks whose source URL contains this string. Empty = search all URLs. */
url_filter?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly hit_count: number;
readonly hits: readonly { readonly content: string; readonly score: number; readonly source: string; readonly title: string; readonly url?: string; }[];
readonly query: string;
}>;
/** `codebase_map` - Structural map of the codebase at a given zoom level (L0-L3). */
codebaseMap(input?: {
include_metrics?: boolean;
level?: string;
max_entries?: number;
root_fqn?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly entries: readonly { readonly children_count?: number; readonly cyclomatic?: number; readonly fqn: string; readonly kind: string; readonly language?: string; readonly lo_c?: number; readonly name: string; }[];
readonly level: string;
readonly totals: { readonly module_count: number; readonly node_count: number; readonly package_count: number; readonly symbol_count: number; };
readonly truncated: boolean;
}>;
/** `codebase_search` - Hybrid (vector + BM25) search over the codebase. Returns ranked hits with FQN, score and match origin. */
codebaseSearch(input?: {
filter_kinds?: readonly string[];
filter_languages?: readonly string[];
filter_packages?: readonly string[];
include_signature?: boolean;
levels?: readonly string[];
min_score?: number;
mode?: string;
query?: string;
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly hits: readonly { readonly fqn: string; readonly match_origin: string; readonly score: number; readonly signature?: string; readonly summary_short?: string; }[];
readonly refreshed_files: number;
readonly total_candidates: number;
readonly truncated: boolean;
}>;
/** `complexity_report` - Top-N methods by complexity (Cyclomatic, NestingDepth, FanOut, LoC, Callers) with median and P95. */
complexityReport(input?: {
metric?: string;
root_fqn?: string | null;
top_n?: number;
}, ctx?: ExecutionContext): Promise<{
readonly evaluated_count: number;
readonly median?: number;
readonly metric: string;
readonly p95?: number;
readonly top: readonly { readonly fqn: string; readonly metric: string; readonly value: number; }[];
}>;
/** `count_pattern` - Count regex occurrences in a file (deterministic, per-pattern). Use when verification requires exact counts rather than LLM estimation. */
countPattern(input: {
/** Count unique matched substrings instead of raw matches */
distinct_matches?: boolean;
/** Return the matched substrings themselves (capped by max_matches_returned) */
include_matches?: boolean;
/** Cap on the returned matches list size (only applies when include_matches=true) */
max_matches_returned?: number | null;
/** Apply RegexOptions.Multiline so ^/$ match line starts/ends */
multiline?: boolean;
/** Virtual file path to scan */
path: string;
/** Regex patterns to count (each evaluated independently over the full file) */
patterns: readonly string[];
}, ctx?: ExecutionContext): Promise<{
readonly bom_stripped: boolean;
readonly bytes_scanned: number;
readonly counts: readonly { readonly count: number; readonly error?: string; readonly matches?: readonly string[]; readonly pattern: string; }[];
}>;
/** `csv_reader` - Read CSV files and return structured data. Supports custom delimiters and header detection. */
csvReader(input: {
/** Column delimiter character (default: ',') */
delimiter?: string;
/** Whether the CSV file has a header row (default: true) */
has_header?: boolean;
/** Maximum number of rows to read (default: no limit) */
max_rows?: number | null;
/** The file path of the CSV file to read */
path: string;
}, ctx?: ExecutionContext): Promise<{
readonly column_count: number;
readonly headers: readonly string[];
readonly row_count: number;
readonly rows: readonly Record<string, unknown>[];
readonly truncated: boolean;
}>;
/** `database_schema` - Inspect database schema (tables, columns, indexes, foreign keys) */
databaseSchema(input: {
/** Database connection string */
connection_string: string;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** Schema scope: Tables (default), Columns, Indexes, ForeignKeys, or All */
schema_scope?: string;
/** Optional table name filter with wildcard support (e.g. 'user*', '*order*') */
table_filter?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly database_name: string;
readonly foreign_keys?: readonly { readonly name: string; readonly source_columns: readonly string[]; readonly source_table: string; readonly target_columns: readonly string[]; readonly target_table: string; }[];
readonly indexes?: readonly { readonly columns: readonly string[]; readonly is_unique: boolean; readonly name: string; readonly table_name: string; readonly type?: string; }[];
readonly provider_name: string;
readonly tables: readonly { readonly columns: readonly { readonly data_type: string; readonly default_value?: string; readonly is_nullable: boolean; readonly is_primary_key: boolean; readonly max_length?: number; readonly name: string; }[]; readonly name: string; readonly row_count_estimate?: number; readonly schema?: string; }[];
}>;
/** `dependency_graph` - Dependency graph at a given scope (L1 packages, L2 modules, L3 symbols). */
dependencyGraph(input?: {
/** Edge kinds to follow, by name: contains, calls, imports, inherits, tests, documents, project_depends. Legacy enum names (Imports, Extends, Implements...) are still accepted. */
edge_kinds?: readonly string[];
include_dot?: boolean;
include_external?: boolean;
include_mermaid?: boolean;
max_nodes?: number;
/** Restrict nodes to these kinds, by name: file, project, namespace, type, member, doc_section, test. Empty keeps every node of the scope. */
node_kinds?: readonly string[];
root_fqn?: string | null;
scope?: string;
}, ctx?: ExecutionContext): Promise<{
readonly dot?: string;
readonly edges: readonly { readonly from: string; readonly kind: string; readonly to: string; }[];
readonly mermaid_flowchart?: string;
readonly metrics: { readonly avg_fan_in: number; readonly avg_fan_out: number; readonly cycle_count: number; readonly edge_count: number; readonly node_count: number; };
readonly nodes: readonly { readonly fqn: string; readonly is_seed: boolean; readonly kind: string; readonly level: string; readonly name: string; }[];
readonly truncated: boolean;
}>;
/** `directory_read` - List directory contents including files and subdirectories. Supports recursive listing and glob pattern filtering. */
directoryRead(input: {
/** Maximum number of entries to return (default: 500). Use a smaller value to avoid overloading context windows. */
max_results?: number;
/** The directory path to list */
path: string;
/** Glob pattern to filter results (e.g., '*.cs', '*.txt') */
pattern?: string;
/** Whether to list contents recursively (default: false) */
recursive?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly directories: readonly { readonly name: string; readonly path: string; readonly size?: number; readonly type: string; }[];
readonly files: readonly { readonly name: string; readonly path: string; readonly size?: number; readonly type: string; }[];
readonly path: string;
readonly total_directories: number;
readonly total_entries_before_truncation?: number;
readonly total_files: number;
readonly truncated: boolean;
readonly warning?: string;
}>;
/** `directory_search` - Perform semantic search across all files in a directory using RAG embeddings. Finds the most relevant file content matching a query. */
directorySearch(input: {
/** Maximum chunk size in characters (default: 500) */
chunk_size?: number;
/** Glob patterns separated by ';' to filter files (default: '*') */
file_patterns?: string;
/** Skip files larger than this size in KB (default: 512) */
max_file_size_kb?: number;
/** Root directory to search */
path: string;
/** Semantic search query */
query: string;
/** Whether to search subdirectories recursively (default: true) */
recursive?: boolean;
/** Minimum similarity threshold 0-1 (default: 0.3) */
threshold?: number;
/** Number of top results to return (default: 5) */
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly files_processed: number;
readonly files_skipped: number;
readonly query: string;
readonly result_count: number;
readonly results: readonly { readonly approximate_line: number; readonly chunk_index: number; readonly content: string; readonly file_extension: string; readonly score: number; readonly source_file: string; }[];
readonly total_chunks: number;
}>;
/** `documented_in` - Markdown sections that document a symbol. */
documentedIn(input?: {
fqn?: string;
}, ctx?: ExecutionContext): Promise<{
readonly sections: readonly { readonly heading_path: string; readonly path: string; readonly start_line: number; }[];
readonly unresolved: readonly string[];
}>;
/** `documents_of` - Symbols documented by the sections of a Markdown file. */
documentsOf(input?: {
path?: string;
}, ctx?: ExecutionContext): Promise<{
readonly symbols: readonly { readonly file: string; readonly fqn: string; readonly heading_path: string; readonly kind: string; }[];
readonly unresolved: readonly string[];
}>;
/** `docx_reader` - Read DOCX (Word) files and return structured data including text, tables, and metadata. */
docxReader(input: {
/** Path to the .docx file to read */
file_path: string;
/** Whether to include document metadata */
include_metadata?: boolean;
/** Whether to extract tables */
include_tables?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly content: string;
readonly metadata: Record<string, string>;
readonly paragraph_count: number;
readonly tables: readonly (readonly string[])[];
}>;
/** `docx_writer` - Create DOCX (Word) files with title, paragraphs, and bullet lists. */
docxWriter(input: {
/** Bullet list items (optional) */
bullet_items?: readonly string[];
/** Output file path for the .docx */
file_path: string;
/** Content paragraphs to write */
paragraphs: readonly string[];
/** Document title */
title?: string;
}, ctx?: ExecutionContext): Promise<{
readonly file_path: string;
readonly file_size: number;
readonly success: boolean;
}>;
/** `edit_batch` - Applies node_replace, node_insert and idempotent intent operations over several files as one transaction. Each operation is {kind, path, selector, text} plus expected_hash (required, node_replace only) or position (node_insert: 'inside', 'before' or 'after'). An intent operation is {kind, path} with kind ensure_using / ensure_import (name, module for TypeScript or JavaScript) or ensure_field / ensure_member (selector of the type, text): it adds the line or member only when absent and reports applied false when it was already there. Operations on one file apply in order, each on the bytes the previous one produced. validate 'parse' (default) refuses the batch when an operation introduces a parse error; 'build' also runs dotnet build on the project above the edited files and restores every file when it is red. On any failure all files are left as they were. */
editBatch(input: {
/** The operations, applied as one transaction; those on one file apply in order, each on the bytes the previous one produced. */
operations: readonly { readonly expected_hash?: string; readonly index?: number; readonly kind: "node_replace" | "node_insert" | "ensure_using" | "ensure_import" | "ensure_field" | "ensure_member" | "ensure_section" | "insert_under_heading" | "replace_mermaid"; readonly level?: number; readonly module?: string; readonly name?: string; readonly path: string; readonly position?: "inside" | "before" | "after"; readonly selector?: string; readonly text?: string; }[];
/** What refuses the batch: 'parse' when an operation introduces a parse error, 'build' when dotnet build on the project above the edited files is red too. */
validate?: "parse" | "build";
}, ctx?: ExecutionContext): Promise<{
readonly operations: readonly { readonly applied: boolean; readonly path: string; readonly range: { readonly end_byte: number; readonly end_line: number; readonly start_byte: number; readonly start_line: number; }; }[];
readonly validation: string;
}>;
/** `edit_file` - Replace a string in a file when it occurs exactly once. */
editFile(input: {
/** Create a backup before writing */
create_backup?: boolean;
/** The replacement text */
new_string: string;
/** The text to replace */
old_string: string;
/** The file to edit */
path: string;
/** Replace every occurrence */
replace_all?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly backup_path?: string;
readonly errors?: readonly string[];
readonly file_info: Record<string, unknown>;
readonly path: string;
readonly replacements: number;
readonly success: boolean;
}>;
/** `file_read` - Read content from files: text, JSON, XML and the like. Parse .eml e-mail files with email_parser. */
fileRead(input: {
/** The text encoding to use (default: UTF-8) */
encoding?: "UTF-8" | "ASCII" | "Unicode" | "UTF-32";
/** Maximum number of lines to return (default: up to the end of the file); max_length caps the result further */
limit?: number | null;
/** Maximum number of characters to read (default: no limit). Applied after offset/limit: when it cuts a line range, only whole lines are kept and has_more is true, except that when the first line alone exceeds max_length it is cut by characters. */
max_length?: number | null;
/** First line to return (1-based, default 1 when limit is given). With offset/limit the file is streamed and not read beyond the range; max_length then caps the range */
offset?: number | null;
/** The file path to read from */
path: string;
/** Serve from RaggableTree index when available (path + SHA-256 match); falls back to disk otherwise. */
use_raggable_cache?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly content: string;
readonly end_line?: number;
readonly file_info: Record<string, unknown>;
readonly has_more: boolean;
readonly served_from_cache: boolean;
readonly start_line?: number;
readonly truncated: boolean;
}>;
/** `file_write` - Write content to files. Can create new files or overwrite existing ones. Creates directories if needed. */
fileWrite(input: {
/** Whether to append to the file instead of overwriting (default: false) */
append?: boolean;
/** The content to write to the file */
content: string;
/** Whether to create a backup before writing (default: false) */
create_backup?: boolean;
/** The text encoding to use (default: UTF-8) */
encoding?: "UTF-8" | "ASCII" | "Unicode" | "UTF-32";
/** The file path to write to */
path: string;
}, ctx?: ExecutionContext): Promise<{
readonly backup_path?: string;
readonly bytes_written: number;
readonly errors?: readonly string[];
readonly path: string;
readonly success: boolean;
}>;
/** `flow_trace` - Trace call flow from a symbol (optionally to a target) within a depth budget. */
flowTrace(input?: {
direction?: string;
edge_kinds?: readonly string[];
from?: string;
include_all_paths?: boolean;
max_depth?: number;
max_paths?: number;
to?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly paths: readonly { readonly call_sites: readonly { readonly end_line: number; readonly sha256: string; readonly start_line: number; readonly virtual_file_path: string; }[]; readonly fqns: readonly string[]; readonly length: number; }[];
readonly truncated: boolean;
}>;
/** `get_last_value` - Read the last retained payload for a given key (LastValueCache). */
getLastValue(input: {
/** Optional crew scope. Defaults to caller's crew. */
crew_scope?: string | null;
/** Cache key */
key: string;
}, ctx?: ExecutionContext): Promise<{
readonly found: boolean;
readonly set_at?: string;
readonly value?: unknown;
}>;
/** `github` - Interact with GitHub API v3: list/create issues, create/read PRs, search repos. create_pr (base, head, title, optional body) needs a token with pull-request write scope. */
github(input: {
/** Action to perform: list_issues, create_issue, create_pr, get_pr, search_repos, get_repo */
action: string;
/** Base branch for create_pr */
base?: string | null;
/** Body content for create operations */
body?: string | null;
/** Head branch for create_pr */
head?: string | null;
/** Issue or PR number (for get operations) */
number?: number | null;
/** Repository owner (GitHub username or organization) */
owner?: string;
/** Search query string for search operations */
query?: string | null;
/** Repository name */
repo?: string;
/** Title for create operations */
title?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly action: string;
readonly error?: string;
readonly items: readonly { readonly body: string; readonly created_at: string; readonly number: number; readonly state: string; readonly title: string; readonly url?: string; }[];
readonly success: boolean;
readonly total_count: number;
}>;
/** `glob` - Expand a wildcard pattern (relative to a mounted directory) and list the matching file paths, sorted and capped. */
glob(input: {
/** Maximum number of paths returned (default: 200) */
max_results?: number;
/** Root directory (virtual path): an existing mounted directory */
path: string;
/** Wildcard pattern relative to path; an absolute pattern is refused */
pattern: string;
}, ctx?: ExecutionContext): Promise<{
readonly paths: readonly string[];
readonly truncated: boolean;
}>;
/** `graph_schema` - Inspect graph database schema (vertex labels, edge labels, properties, indexes) */
graphSchema(input: {
/** Database name (required for ArcadeDB) */
database?: string | null;
/** Endpoint URI for the graph database (Bolt URI for ArcadeDB, WebSocket URI for JanusGraph) */
endpoint: string;
/** Graph database type: ArcadeDB or JanusGraph */
graph_type: string;
/** Password for authentication */
password?: string | null;
/** Username for authentication */
username?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly edge_labels: readonly { readonly label: string; readonly properties: readonly string[]; readonly source_label?: string; readonly target_label?: string; }[];
readonly graph_type: string;
readonly indexes: readonly { readonly index_type?: string; readonly is_unique: boolean; readonly name: string; readonly property_keys: readonly string[]; }[];
readonly property_keys: readonly { readonly cardinality?: string; readonly data_type: string; readonly name: string; }[];
readonly vertex_labels: readonly { readonly count_estimate?: number; readonly label: string; readonly properties: readonly string[]; }[];
}>;
/** `grep` - Search the lines of text files under a mounted directory (path) with a regex; glob filters files relative to path. Binary, unreadable and over-1-MiB files are skipped; regex timeout, max_results and max_files bound the scan. Returns path:line:text hits. */
grep(input: {
/** Case-insensitive matching */
case_insensitive?: boolean;
/** Optional file filter relative to path (never absolute); all files when absent */
glob?: string | null;
/** Maximum number of files scanned; binary or unreadable files are skipped and counted (default: 2000) */
max_files?: number;
/** Maximum number of hits (default: 200) */
max_results?: number;
/** Root directory searched (virtual path, a mounted directory inside the agent root) */
path: string;
/** Regular expression searched in each line (per-match timeout; the scan stops and timed_out is set on a timeout) */
pattern: string;
}, ctx?: ExecutionContext): Promise<{
readonly files_scanned: number;
readonly files_skipped: number;
readonly hits: readonly { readonly line: number; readonly path: string; readonly text: string; }[];
readonly timed_out: boolean;
readonly truncated: boolean;
}>;
/** `http_api` - Make HTTP API calls with support for GET, POST, PUT, DELETE, PATCH methods. Returns response body, status code, and headers. */
httpApi(input: {
/** Optional request body (for POST, PUT, PATCH) */
body?: string | null;
/** Content-Type header for request body (default: application/json) */
content_type?: string;
/** Optional HTTP headers as key-value pairs */
headers?: unknown;
/** HTTP method (default: GET) */
method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";
/** The URL to call */
url: string;
}, ctx?: ExecutionContext): Promise<{
readonly body: string;
readonly header_warnings?: readonly string[];
readonly headers: Record<string, string>;
readonly is_success: boolean;
readonly status_code: number;
readonly status_description: string;
}>;
/** `human_input` - Ask the human user for input (text, approval, or a choice). The runtime suspends until the user responds. */
humanInput(input: {
/** Allowed choices when input_type=choice */
choices?: readonly string[];
/** Default value returned if the user gives no answer */
default_value?: string | null;
/** Optional virtual path the user may edit before approving. Capable providers open an inline editor when a choice whose value contains 'edit' is selected. Path semantics are owned by the caller; the provider routes I/O through IFileSystemService. */
edit_file_path?: string | null;
/** Input type: text (free text), approval (yes/no), choice (one of choices[]), or multi (several of choices[]) */
input_type?: string;
/** The prompt text shown to the user */
prompt: string;
/** Index into choices[] of the recommended option */
recommended?: number | null;
}, ctx?: ExecutionContext): Promise<{
readonly input_type: string;
readonly is_approved: boolean;
readonly response: string;
readonly values: readonly string[];
readonly was_default: boolean;
}>;
/** `image_generation` - Generate images using OpenAI DALL-E API. Supports text-to-image generation with configurable size, quality, and format. */
imageGeneration(input: {
/** DALL-E model to use */
model?: string;
/** Number of images to generate (1 for dall-e-3, 1-10 for dall-e-2) */
number_of_images?: number;
/** Text description of the image to generate (max 4000 chars) */
prompt: string;
/** Image quality: standard or hd */
quality?: string;
/** Response format: url or b64_json */
response_format?: string;
/** Optional file path to save the generated image locally */
save_to_path?: string | null;
/** Image size (e.g. 1024x1024, 1024x1792, 1792x1024) */
size?: string;
}, ctx?: ExecutionContext): Promise<{
readonly image_count: number;
readonly images: readonly { readonly base64?: string; readonly revised_prompt?: string; readonly saved_path?: string; readonly url?: string; }[];
readonly model: string;
}>;
/** `impact_analysis` - Who is affected if we change this symbol? Direct + transitive callers, grouped by package. */
impactAnalysis(input?: {
direction?: string;
max_depth?: number;
max_nodes?: number;
target?: string;
}, ctx?: ExecutionContext): Promise<{
readonly by_package: Record<string, number>;
readonly direct_impact: readonly string[];
readonly target: string;
readonly top_callers: readonly { readonly fqn: string; readonly kind: string; readonly signature?: string; readonly summary_short?: string; }[];
readonly transitive_impact: readonly string[];
readonly truncated: boolean;
}>;
/** `incremental_reindex` - Reindex only files changed since a prior commit or from an explicit list. Cost is proportional to the changed files, not the repository: one file of 2 000 lines reindexes in under 2 s. */
incrementalReindex(input?: {
changed_files?: readonly string[];
enrich_with_llm?: boolean;
from_commit?: string | null;
languages?: readonly string[];
root_path?: string;
to_commit?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly edge_count: number;
readonly elapsed: string;
readonly embedding_stats?: { readonly dimensions: number; readonly elapsed: string; readonly model: string; readonly nodes_embedded: number; readonly nodes_skipped: number; readonly provider: string; };
readonly errors: readonly string[];
readonly file_count: number;
readonly filter_stats: { readonly excluded_by_exclude_set: number; readonly excluded_by_gitignore: number; readonly excluded_by_language: number; readonly excluded_by_policy: number; readonly excluded_by_policy_paths: readonly string[]; readonly excluded_by_suffix: number; readonly physical_entries_probe: number; readonly physical_root: string; readonly total_enumerated: number; readonly vfs_file_entries_yielded: number; };
readonly index_id: string;
readonly node_count: number;
readonly statement_count: number;
}>;
/** `index_codebase` - Scan the codebase and build the full RaggableTree index. */
indexCodebase(input?: {
embedding_model?: string;
enrich_with_llm?: boolean;
exclude?: readonly string[];
languages?: readonly string[];
respect_gitignore?: boolean;
root_alias?: string;
root_path?: string;
}, ctx?: ExecutionContext): Promise<{
readonly edge_count: number;
readonly elapsed: string;
readonly embedding_stats?: { readonly dimensions: number; readonly elapsed: string; readonly model: string; readonly nodes_embedded: number; readonly nodes_skipped: number; readonly provider: string; };
readonly errors: readonly string[];
readonly file_count: number;
readonly filter_stats: { readonly excluded_by_exclude_set: number; readonly excluded_by_gitignore: number; readonly excluded_by_language: number; readonly excluded_by_policy: number; readonly excluded_by_policy_paths: readonly string[]; readonly excluded_by_suffix: number; readonly physical_entries_probe: number; readonly physical_root: string; readonly total_enumerated: number; readonly vfs_file_entries_yielded: number; };
readonly index_id: string;
readonly node_count: number;
readonly statement_count: number;
}>;
/** `index_status` - List every virtual root currently indexed in the RaggableTree store. */
indexStatus(input?: Record<string, never>, ctx?: ExecutionContext): Promise<{
readonly dirty_count: number;
readonly dirty_paths: readonly string[];
readonly roots: readonly { readonly edge_count: number; readonly indexed_at: string; readonly language_summary?: string; readonly node_count: number; readonly virtual_root: string; }[];
}>;
/** `is_path_indexed` - Check whether a virtual path is covered by any indexed root (longest match wins). */
isPathIndexed(input?: {
virtual_path?: string;
}, ctx?: ExecutionContext): Promise<{
readonly indexed: boolean;
readonly indexed_at?: string;
readonly root_parent?: string;
}>;
/** `janusgraph_query` - Execute Gremlin traversals on JanusGraph databases */
janusgraphQuery(input: {
/** Parameter bindings for the traversal as key-value pairs */
bindings?: Record<string, unknown> | null;
/** Gremlin WebSocket endpoint URI */
gremlin_endpoint: string;
/** Maximum number of results to return */
max_results?: number;
/** Timeout in milliseconds for traversal execution */
timeout_ms?: number;
/** Gremlin traversal string to execute */
traversal: string;
}, ctx?: ExecutionContext): Promise<{
readonly execution_time_ms: number;
readonly result_count: number;
readonly result_type: string;
readonly results?: readonly Record<string, unknown>[];
}>;
/** `json_tool` - JSON manipulation tool supporting parse, query, and format operations. */
jsonTool(input: {
/** The JSON string to process */
input: string;
/** The operation to perform: parse, query, or format */
operation: string;
/** Dot-notation path for query operation (e.g., 'data.items[0].name') */
query?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly formatted?: string;
readonly info?: Record<string, unknown>;
readonly length?: number;
readonly parsed?: boolean;
readonly query?: string;
readonly type?: string;
readonly value?: unknown;
}>;
/** `list_mounts` - Lists all available file system mounts with their virtual paths and access rights. */
listMounts(input?: Record<string, never>, ctx?: ExecutionContext): Promise<{
readonly mounts: readonly { readonly access: string; readonly overrides: readonly { readonly access: string; readonly virtual_path: string; }[]; readonly virtual_path: string; }[];
readonly success: boolean;
}>;
/** `local_embed_text` - Generate embeddings for one or more texts using the on-device BGE-micro-v2 model. */
localEmbedText(input: {
/** Texts to embed. One vector is returned per entry, in the same order. */
inputs: readonly string[];
/** Optional model alias (e.g. "bge-micro-v2"). Ignored when the host has a single local model registered. */
model?: string | null;
/** Hint for the desired vector dimensionality. Honoured only if the underlying model supports projection / truncation. Otherwise ignored and the model's native dimension is returned. */
requested_dimensions?: number | null;
}, ctx?: ExecutionContext): Promise<{
readonly dimensions: number;
readonly embeddings: readonly (readonly number[])[];
readonly model: string;
readonly truncated_count: number;
}>;
/** `mariadb_query` - Execute SQL queries on MariaDB databases */
mariadbQuery(input: {
/** Database connection string */
connection_string: string;
/** Maximum number of rows to return for SELECT queries */
max_rows?: number;
/** Optional named parameters for parameterized queries (e.g. {"active": true}) */
parameters?: Record<string, unknown> | null;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** SQL query to execute */
query: string;
/** Type of query: Select (returns rows), Execute (returns affected rows count), or Scalar (returns single value) */
query_type?: string;
/** Query timeout in seconds */
timeout_seconds?: number;
}, ctx?: ExecutionContext): Promise<{
readonly affected_rows?: number;
readonly column_count?: number;
readonly columns?: readonly string[];
readonly execution_time_ms: number;
readonly provider_name: string;
readonly query_type: string;
readonly row_count?: number;
readonly rows?: readonly Record<string, unknown>[];
readonly scalar_result?: unknown;
}>;
/** `mdx_search` - Perform semantic search within Markdown (.md, .mdx) files using RAG embeddings. Strips frontmatter and JSX before searching. */
mdxSearch(input: {
/** Maximum chunk size in characters (default: 500) */
chunk_size?: number;
/** File or directory path to search within */
path: string;
/** Semantic search query */
query: string;
/** Minimum similarity threshold 0-1 (default: 0.3) */
threshold?: number;
/** Number of top results to return (default: 5) */
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly files_processed: number;
readonly query: string;
readonly result_count: number;
readonly results: readonly { readonly approximate_line: number; readonly chunk_index: number; readonly content: string; readonly score: number; readonly source_file: string; }[];
readonly total_chunks: number;
}>;
/** `memory_store` - List, add, delete, and get typed memory entries (user/project/feedback/reference). */
memoryStore(input?: {
category?: string | null;
content?: string | null;
id?: number;
operation?: string;
}, ctx?: ExecutionContext): Promise<{
readonly entries?: readonly unknown[];
readonly entry?: unknown;
readonly error?: string;
readonly id?: number;
readonly success: boolean;
}>;
/** `mongodb_query` - Execute operations on MongoDB databases (Find, Aggregate, CRUD) */
mongodbQuery(input: {
/** Collection name to operate on */
collection: string;
/** MongoDB connection string */
connection_string: string;
/** Database name to operate on */
database: string;
/** JSON document to insert for InsertOne operations */
document?: string | null;
/** JSON filter document for Find/Update/Delete/Count/Distinct operations */
filter?: string | null;
/** Maximum number of documents to return (default 100) */
limit?: number;
/** Operation to perform: Find, Aggregate, InsertOne, UpdateOne, DeleteOne, Count, Distinct */
operation: string;
/** JSON array of pipeline stages for Aggregate operations */
pipeline?: string | null;
/** JSON projection document for Find operations */
projection?: string | null;
/** Number of documents to skip */
skip?: number;
/** JSON sort document for Find operations */
sort?: string | null;
/** JSON update document for UpdateOne operations */
update?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly distinct_values?: readonly string[];
readonly document_count: number;
readonly documents?: readonly string[];
readonly execution_time_ms: number;
readonly inserted_id?: string;
readonly matched_count: number;
readonly modified_count: number;
readonly operation: string;
}>;
/** `mongodb_schema` - Inspect MongoDB database schema by sampling documents */
mongodbSchema(input: {
/** Optional collection name to inspect (if omitted, inspects all collections) */
collection?: string | null;
/** MongoDB connection string */
connection_string: string;
/** Database name to inspect */
database: string;
/** Number of documents to sample for schema inference (default 100) */
sample_size?: number;
}, ctx?: ExecutionContext): Promise<{
readonly collections: readonly { readonly document_count: number; readonly indexes: readonly { readonly is_sparse: boolean; readonly is_unique: boolean; readonly keys: Record<string, number>; readonly name: string; }[]; readonly inferred_fields: readonly { readonly bson_type: string; readonly frequency: number; readonly is_indexed: boolean; readonly name: string; readonly sample_values: readonly string[]; }[]; readonly name: string; }[];
readonly database_name: string;
}>;
/** `mysql_query` - Execute SQL queries on MySQL databases */
mysqlQuery(input: {
/** Database connection string */
connection_string: string;
/** Maximum number of rows to return for SELECT queries */
max_rows?: number;
/** Optional named parameters for parameterized queries (e.g. {"active": true}) */
parameters?: Record<string, unknown> | null;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** SQL query to execute */
query: string;
/** Type of query: Select (returns rows), Execute (returns affected rows count), or Scalar (returns single value) */
query_type?: string;
/** Query timeout in seconds */
timeout_seconds?: number;
}, ctx?: ExecutionContext): Promise<{
readonly affected_rows?: number;
readonly column_count?: number;
readonly columns?: readonly string[];
readonly execution_time_ms: number;
readonly provider_name: string;
readonly query_type: string;
readonly row_count?: number;
readonly rows?: readonly Record<string, unknown>[];
readonly scalar_result?: unknown;
}>;
/** `node_ensure` - Applies one idempotent intent operation on one file: ensure_using / ensure_import (name, plus module for TypeScript or JavaScript) adds the using or import line in its place only when absent; ensure_field / ensure_member (selector of the type, text) adds a field, property or method next to its peers only when no member of that name exists. On Markdown: ensure_section (name = heading path, optional level) creates the missing headings; insert_under_heading (selector, text) appends at the end of a section; replace_mermaid (selector, index 0-based, text) replaces the body of the n-th mermaid fence of a section. Calling it again changes nothing and writes nothing: applied is false and range is the existing line or member. The insert is refused when it introduces a parse error that was not there before, the file is then untouched. */
nodeEnsure(input: {
/** 0-based index of the mermaid fence to replace in the section (replace_mermaid). */
index?: number | null;
/** Heading level of the section to create (ensure_section); the parent's plus one when omitted. */
level?: number | null;
/** The module an import comes from, for TypeScript or JavaScript (ensure_import). */
module?: string | null;
/** The namespace or module to import (ensure_using, ensure_import), or the heading path to create (ensure_section). */
name?: string | null;
/** The intent operation. */
op: "ensure_using" | "ensure_import" | "ensure_field" | "ensure_member" | "ensure_section" | "insert_under_heading" | "replace_mermaid";
/** Path of the file to edit, absolute under a mounted root or relative to the working root. */
path: string;
/** Selector of the type (ensure_field, ensure_member) or of the Markdown section (insert_under_heading, replace_mermaid), as node_outline lists it. */
selector?: string | null;
/** The member to add (ensure_field, ensure_member), the text to append (insert_under_heading) or the new fence body (replace_mermaid). */
text?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly applied: boolean;
readonly new_hash: string;
readonly range: { readonly end_byte: number; readonly end_line: number; readonly start_byte: number; readonly start_line: number; };
}>;
/** `node_insert` - Inserts text relative to an anchor node: position 'inside' appends to a type or namespace body (after the last member of an indented or end-closed body; an enum member or a JSON pair gets its separating comma) or to the end of a Markdown section, 'before' puts it above the anchor's leading comments and attributes, 'after' below the anchor. There is no expected_hash: no anchor hash is required for before/after, the anchor is only a location. The text is re-indented line by line to the siblings' indentation (tabs or spaces as the file does); the insert is refused when it introduces a parse error that was not there before, the file is then untouched. */
nodeInsert(input: {
/** Path of the file to edit, absolute under a mounted root or relative to the working root. */
path: string;
/** Where the text goes relative to the anchor: inside its body, before it or after it. */
position: "inside" | "before" | "after";
/** Selector of the anchor node, as node_outline lists it: Ns.Type.Member(paramTypes), Section/Sub for Markdown, or @ts:<node-path>. */
selector: string;
/** The text to insert; re-indented to the siblings' indentation. */
text: string;
}, ctx?: ExecutionContext): Promise<{
readonly new_hash: string;
readonly range: { readonly end_byte: number; readonly end_line: number; readonly start_byte: number; readonly start_line: number; };
}>;
/** `node_outline` - Outline of a file's members. */
nodeOutline(input: {
/** Path of the file to outline, absolute under a mounted root or relative to the working root. */
path: string;
}, ctx?: ExecutionContext): Promise<{
readonly members: readonly { readonly end_byte: number; readonly end_line: number; readonly kind: string; readonly selector: string; readonly start_byte: number; readonly start_line: number; }[];
}>;
/** `node_read` - Reads one member of a file by selector: text, range and SHA-256, uncut. */
nodeRead(input: {
/** Path of the file holding the member, absolute under a mounted root or relative to the working root. */
path: string;
/** Member to read. Readable form: Ns.Type.Member(paramTypes), e.g. Demo.Calc.Add(int). Markdown form: Section/Sub; sibling headings of the same name take a 1-based ordinal, e.g. Section/Notes[2]. Fallback form: @ts:<node-path>, the tree-sitter path root/<index>/<kind>/... returned when a readable selector is ambiguous. */
selector: string;
}, ctx?: ExecutionContext): Promise<{
readonly end_byte: number;
readonly end_line: number;
readonly kind: string;
readonly path: string;
readonly selector: string;
readonly sha256: string;
readonly start_byte: number;
readonly start_line: number;
readonly text: string;
}>;
/** `node_replace` - Replaces one node of a file by selector and expected SHA-256 (from node_read): refused when the hash is stale or when the replacement introduces a parse error that was not there before; the file is then untouched. The replaced span includes the node's leading comments and attributes, so a replacement that omits them removes them; a Markdown section replaces its sub-sections too. Line endings are normalised to the file's. */
nodeReplace(input: {
/** SHA-256 of the node's current text, as node_read returned it; the replacement is refused when it is stale. */
expected_hash: string;
/** Path of the file to edit, absolute under a mounted root or relative to the working root. */
path: string;
/** Selector of the node to replace, as node_outline lists it: Ns.Type.Member(paramTypes), Section/Sub for Markdown, or @ts:<node-path>. */
selector: string;
/** The replacement text of the whole node, its leading comments and attributes included. */
text: string;
}, ctx?: ExecutionContext): Promise<{
readonly new_hash: string;
readonly range: { readonly end_byte: number; readonly end_line: number; readonly start_byte: number; readonly start_line: number; };
}>;
/** `package_summary` - Details about a package (L1): file count, symbol count, exports, dependencies. */
packageSummary(input?: {
fqn?: string;
include_dependencies?: boolean;
include_public_exports?: boolean;
max_exports?: number;
}, ctx?: ExecutionContext): Promise<{
readonly dependencies: readonly string[];
readonly entry_points: readonly string[];
readonly file_count: number;
readonly fqn: string;
readonly name?: string;
readonly public_exports: readonly string[];
readonly summary_short?: string;
readonly symbol_count: number;
readonly truncated: boolean;
}>;
/** `pdf_reader` - Extract text content from PDF files. Supports page range selection. */
pdfReader(input: {
/** Optional page range (e.g., '1-5', '1,3,5', '2-'). Default: all pages. */
page_range?: string | null;
/** The file path of the PDF to read */
path: string;
}, ctx?: ExecutionContext): Promise<{
readonly content: string;
readonly page_range: string;
readonly pages: readonly { readonly height: number; readonly page_number: number; readonly text: string; readonly width: number; }[];
readonly pages_read: number;
readonly total_pages: number;
}>;
/** `pdf_search` - Perform semantic search within PDF documents using RAG embeddings. */
pdfSearch(input: {
/** Chunk size in characters for text splitting */
chunk_size?: number;
/** Optional page range (e.g., '1-5', '1,3,5', '2-'). Default: all pages. */
page_range?: string | null;
/** Path to a PDF file or a directory of PDFs */
path: string;
/** The semantic search query */
query: string;
/** Minimum cosine similarity threshold (0.0 to 1.0) */
threshold?: number;
/** Maximum number of results to return */
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly files_processed: number;
readonly query: string;
readonly result_count: number;
readonly results: readonly { readonly chunk_index: number; readonly content: string; readonly page_number: number; readonly score: number; readonly source_file: string; }[];
readonly total_chunks: number;
readonly total_pages: number;
}>;
/** `post_message` - Fire-and-forget a message to a mailbox (agent://, crew://, topic://, or client://). */
postMessage(input: {
/** Optional metadata key/value pairs, copied into the envelope the recipient reads */
metadata?: Record<string, string> | null;
/** JSON payload */
payload?: unknown;
/** Mailbox URI (agent://, crew://, topic://, or client:// for an external client such as Studio) */
target_mailbox: string;
}, ctx?: ExecutionContext): Promise<{
readonly message_id: string;
readonly posted_at: string;
}>;
/** `postgres_query` - Execute SQL queries on PostgreSQL databases */
postgresQuery(input: {
/** Database connection string */
connection_string: string;
/** Maximum number of rows to return for SELECT queries */
max_rows?: number;
/** Optional named parameters for parameterized queries (e.g. {"active": true}) */
parameters?: Record<string, unknown> | null;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** SQL query to execute */
query: string;
/** Type of query: Select (returns rows), Execute (returns affected rows count), or Scalar (returns single value) */
query_type?: string;
/** Query timeout in seconds */
timeout_seconds?: number;
}, ctx?: ExecutionContext): Promise<{
readonly affected_rows?: number;
readonly column_count?: number;
readonly columns?: readonly string[];
readonly execution_time_ms: number;
readonly provider_name: string;
readonly query_type: string;
readonly row_count?: number;
readonly rows?: readonly Record<string, unknown>[];
readonly scalar_result?: unknown;
}>;
/** `progress_report` - Report the progress of a long-running scripted operation (label, step/total or percent, message). */
progressReport(input?: {
done?: boolean;
label?: string;
message?: string | null;
percent?: number | null;
step?: number | null;
total?: number | null;
}, ctx?: ExecutionContext): Promise<{
readonly acknowledged: boolean;
}>;
/** `publish_event` - Publish an event on a topic (broadcast 1→N). Optional crew scope and metadata. */
publishEvent(input: {
/** Cache key when retain_as_last_value is true */
last_value_key?: string | null;
/** Optional metadata key/value pairs */
metadata?: Record<string, string> | null;
/** JSON payload to publish */
payload?: unknown;
/** Retain the message in the LastValueCache (requires last_value_key) */
retain_as_last_value?: boolean;
/** Crew scope. Omit for global broadcast. */
target_crew_id?: string | null;
/** Topic name (must not start with _system.) */
topic: string;
}, ctx?: ExecutionContext): Promise<{
readonly event_id: string;
readonly published_at: string;
}>;
/** `rag_eval` - Evaluate a RAG knowledge collection against a golden dataset (YAML): recall@k, precision@k, MRR, groundedness and answer-relevance (judge mode labelled: llm or heuristic). Writes markdown/JSON reports and returns the aggregate summary. */
ragEval(input?: {
collection?: string | null;
compare?: unknown;
dataset?: string;
k?: number;
profile?: string | null;
reindex?: boolean;
use_llm_judge?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly cases: readonly { readonly case_id: string; readonly profile: string; readonly recall_at_k?: number; readonly reciprocal_rank?: number; }[];
readonly metrics: readonly { readonly answer_relevance?: number; readonly groundedness?: number; readonly judge: string; readonly k: number; readonly mrr?: number; readonly precision_at_k?: number; readonly profile: string; readonly recall_at_k?: number; }[];
readonly reports: readonly string[];
}>;
/** `rag_ingest` - Ingest documents into a knowledge collection so they become searchable via rag_search. Accepts file paths, glob patterns and http(s) addresses; unchanged sources are skipped (incremental). */
ragIngest(input: {
/** Optional chunking strategy name (recursive, sentence, structural, semantic); pipeline default when omitted */
chunking_strategy?: string;
/** Target collection in the document store */
collection: string;
/** Delete the chunks and manifest entries of previously ingested sources absent from 'sources' */
prune?: boolean;
/** Force a full reindex of the collection (required after an embedding model change) */
reindex?: boolean;
/** File paths, glob patterns or http(s) addresses to ingest (e.g. '/workspace/docs/**//*.md') */
sources: readonly unknown[];
}, ctx?: ExecutionContext): Promise<unknown>;
/** `rag_search` - Search knowledge bases and retrieve answers grounded in documents. Use this when you need factual information from the agent's knowledge sources. */
ragSearch(input?: {
collection?: string | null;
question?: string;
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly answer: string;
readonly citations: readonly { readonly chunk_id: string; readonly content?: string; readonly document_id?: string; readonly end_offset: number; readonly marker: number; readonly score: number; readonly snippet?: string; readonly source_id: string; readonly start_offset: number; }[];
}>;
/** `receive_message` - Pull the next message from a mailbox (default: current agent). Only mailboxes of the calling crew are readable — reading is destructive, and a mailbox belongs to its owner. Requires exactly one of timeout_ms / wait_forever. */
receiveMessage(input?: {
/** Optional mailbox URI, restricted to the calling crew's own mailboxes (agent:// or crew:// of this crew). Defaults to the calling agent's mailbox. */
mailbox?: string | null;
/** Wait timeout in ms (mutually exclusive with wait_forever) */
timeout_ms?: number | null;
/** Wait indefinitely (mutually exclusive with timeout_ms) */
wait_forever?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly message?: { readonly correlation_id?: string; readonly message_id: string; readonly metadata: Record<string, string>; readonly payload?: unknown; readonly published_at: string; readonly source_agent_id?: string; readonly source_crew_id: string; readonly topic: string; };
readonly timed_out: boolean;
}>;
/** `relational_database_query` - Execute SQL queries on relational databases (SQL Server, PostgreSQL, MySQL, MariaDB, SQLite) */
relationalDatabaseQuery(input: {
/** Database connection string */
connection_string: string;
/** Maximum number of rows to return for SELECT queries */
max_rows?: number;
/** Optional named parameters for parameterized queries (e.g. {"active": true}) */
parameters?: Record<string, unknown> | null;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** SQL query to execute */
query: string;
/** Type of query: Select (returns rows), Execute (returns affected rows count), or Scalar (returns single value) */
query_type?: string;
/** Query timeout in seconds */
timeout_seconds?: number;
}, ctx?: ExecutionContext): Promise<{
readonly affected_rows?: number;
readonly column_count?: number;
readonly columns?: readonly string[];
readonly execution_time_ms: number;
readonly provider_name: string;
readonly query_type: string;
readonly row_count?: number;
readonly rows?: readonly Record<string, unknown>[];
readonly scalar_result?: unknown;
}>;
/** `reply_to` - Reply to a pending request identified by correlation_id. */
replyTo(input: {
/** Correlation id from the original Send/request envelope */
correlation_id: string;
/** JSON payload to return */
payload?: unknown;
}, ctx?: ExecutionContext): Promise<{
readonly replied_at: string;
}>;
/** `scrape_element` - Extract targeted elements from a web page using CSS selectors. Returns text, optional HTML, and attributes for matched elements. */
scrapeElement(input: {
/** CSS selector to find elements */
css_selector: string;
/** Include HTML attributes for each element */
extract_attributes?: boolean;
/** Include raw inner HTML for each element */
include_html?: boolean;
/** Maximum number of elements to return */
max_elements?: number;
/** The URL of the web page to scrape */
url: string;
}, ctx?: ExecutionContext): Promise<{
readonly css_selector: string;
readonly element_count: number;
readonly elements: readonly { readonly attributes?: Record<string, string>; readonly html?: string; readonly index: number; readonly text: string; }[];
readonly returned_count: number;
readonly url?: string;
}>;
/** `send_request` - Send a request to a mailbox and wait for a correlated reply (timeout_ms required). */
sendRequest(input: {
/** Optional metadata key/value pairs, copied into the envelope the responder reads */
metadata?: Record<string, string> | null;
/** JSON payload for the request */
payload?: unknown;
/** Mailbox URI of the responder */
target_mailbox: string;
/** Timeout in milliseconds. Must be strictly positive. Forever not allowed. */
timeout_ms?: number | null;
}, ctx?: ExecutionContext): Promise<{
readonly response_payload?: unknown;
}>;
/** `session_cost` - Report cumulative session cost in USD, token usage, and a per-model breakdown. */
sessionCost(input?: Record<string, never>, ctx?: ExecutionContext): Promise<{
readonly by_model: Record<string, string>;
readonly total_calls: number;
readonly total_cost_usd: string;
readonly total_tokens: number;
}>;
/** `session_snip` - Immediately truncate the conversation to a minimal window without analysis. */
sessionSnip(input?: {
retain_count?: number;
}, ctx?: ExecutionContext): Promise<{
readonly removed_count: number;
readonly retained_count: number;
}>;
/** `session_stats` - Report full session telemetry: message count, estimated tokens, cost, and call totals. */
sessionStats(input?: Record<string, never>, ctx?: ExecutionContext): Promise<{
readonly by_model: Record<string, string>;
readonly by_model_tokens: readonly { readonly cache_read_tokens: number; readonly cache_write_tokens: number; readonly completion_tokens: number; readonly model: string; readonly prompt_tokens: number; }[];
readonly estimated_tokens: number;
readonly message_count: number;
readonly total_calls: number;
readonly total_cost_usd: string;
readonly total_tokens: number;
}>;
/** `session_store` - Read, write, truncate, and annotate the current session conversation buffer and metadata. */
sessionStore(input?: {
key?: string | null;
messages?: readonly unknown[] | null;
note?: string | null;
operation?: string;
retain_count?: number;
title?: string | null;
value?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly messages?: readonly unknown[];
readonly metadata?: unknown;
readonly removed_count: number;
readonly success: boolean;
readonly value?: string;
}>;
/** `shell_command` - Execute shell commands with security controls. Supports allowlist/blocklist, timeout, and output capture. */
shellCommand(input: {
/** run (default): run the command and wait; start_job: start it detached, output to a log file; job_status: running or exit code of a job; job_tail: last lines of a job's log */
action?: string;
/** Shell command to execute; required by the run and start_job actions */
command: string;
/** Id returned by start_job, for job_status and job_tail */
job_id?: string;
/** Lines job_tail returns from the end of the log */
tail_lines?: number;
/** Timeout in seconds */
timeout_seconds?: number;
/** Virtual working directory for command execution, e.g. /workspace. Defaults to the working directory relative file paths resolve against (the agent's root, else /workspace); outside an agent root, a writing command that directory does not allow runs in the write directory (/output). */
working_directory?: string;
}, ctx?: ExecutionContext): Promise<{
readonly completed: boolean;
readonly exit_code: number;
readonly job_id: string;
readonly output_path: string;
readonly status: string;
readonly stderr: string;
readonly stdout: string;
readonly tail: string;
}>;
/** `sqlserver_query` - Execute SQL queries on Microsoft SQL Server databases */
sqlserverQuery(input: {
/** Database connection string */
connection_string: string;
/** Maximum number of rows to return for SELECT queries */
max_rows?: number;
/** Optional named parameters for parameterized queries (e.g. {"active": true}) */
parameters?: Record<string, unknown> | null;
/** ADO.NET provider name: Microsoft.Data.SqlClient, Npgsql, MySqlConnector, or Microsoft.Data.Sqlite */
provider_name: string;
/** SQL query to execute */
query: string;
/** Type of query: Select (returns rows), Execute (returns affected rows count), or Scalar (returns single value) */
query_type?: string;
/** Query timeout in seconds */
timeout_seconds?: number;
}, ctx?: ExecutionContext): Promise<{
readonly affected_rows?: number;
readonly column_count?: number;
readonly columns?: readonly string[];
readonly execution_time_ms: number;
readonly provider_name: string;
readonly query_type: string;
readonly row_count?: number;
readonly rows?: readonly Record<string, unknown>[];
readonly scalar_result?: unknown;
}>;
/** `statement_query` - Query L4 statements by kind, parent FQN, or semantic similarity. */
statementQuery(input?: {
kinds?: readonly string[];
parent_fqns?: readonly string[];
semantic_query?: string | null;
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly hits: readonly { readonly condition?: string; readonly end_line?: number; readonly expression?: string; readonly kind: string; readonly parent_fqn: string; readonly score?: number; readonly start_line: number; readonly statement_id: string; }[];
readonly truncated: boolean;
}>;
/** `structural_rewrite` - Applies a rule's fix template to the matching files; dry run by default. */
structuralRewrite(input?: {
dry_run?: boolean;
fix?: string | null;
glob?: string | null;
language?: string;
max_files?: number;
paths?: readonly string[];
pattern?: string | null;
rule?: unknown;
rule_file?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly files: readonly { readonly applied: number; readonly diff: string; readonly matches: number; readonly path: string; readonly refused_reason?: string; readonly skipped: readonly string[]; }[];
readonly files_scanned: number;
readonly truncated: boolean;
}>;
/** `structural_search` - Searches the files of one language (any tree-sitter grammar Orkeon loads, or Markdown) for a code pattern parsed with the target grammar: $NAME matches one node and captures its text, $$$NAME matches zero or more sibling nodes. Returns path, line, column, text, captures and the enclosing symbol of each match. */
structuralSearch(input?: {
glob?: string | null;
language?: string;
max_files?: number;
max_results?: number;
paths?: readonly string[];
/** Code pattern with $NAME / $$$NAME metavariables. Give exactly one of pattern, rule or rule_file. */
pattern?: string | null;
/** Structural rule object. Keys: kind, pattern, regex, field, inside, has, not, all, any, stopBy. Any other key is refused by name. */
rule?: unknown;
/** Virtual path of a YAML rule file (id, language, rule, message, severity, fix) under a mounted root. */
rule_file?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly files_scanned: number;
readonly matches: readonly { readonly captures: Record<string, string>; readonly column: number; readonly enclosing_symbol?: string; readonly line: number; readonly path: string; readonly text: string; }[];
readonly truncated: boolean;
}>;
/** `sub_graph` - Sub-graph expansion around seeds, bounded by depth and node count. */
subGraph(input?: {
depth?: number;
direction?: string;
/** Edge kinds to follow, by name: contains, calls, imports, inherits, tests, documents, project_depends. Legacy enum names (Imports, Extends, Implements...) are still accepted. */
edge_kinds?: readonly string[];
include_mermaid?: boolean;
max_nodes?: number;
/** Keep only expanded nodes of these kinds, by name: file, project, namespace, type, member, doc_section, test. Empty keeps every node. */
node_kinds?: readonly string[];
seeds?: readonly string[];
}, ctx?: ExecutionContext): Promise<{
readonly edges: readonly { readonly from: string; readonly kind: string; readonly to: string; }[];
readonly mermaid_flowchart?: string;
readonly nodes: readonly { readonly fqn: string; readonly is_seed: boolean; readonly kind: string; readonly level: string; readonly name: string; }[];
readonly truncated: boolean;
}>;
/** `symbol_detail` - Expanded detail for an L3 symbol: signature, doc, body metrics, members, callers, callees, statements. */
symbolDetail(input?: {
expand?: string;
fqn?: string;
include_body_metrics?: boolean;
include_doc?: boolean;
include_signature?: boolean;
max_children?: number;
}, ctx?: ExecutionContext): Promise<{
readonly body?: { readonly await_count: number; readonly branch_count: number; readonly call_count: number; readonly closure_count: number; readonly cyclomatic_complexity: number; readonly early_return_count: number; readonly is_partial: boolean; readonly loop_count: number; readonly max_depth: number; readonly statement_count: number; readonly try_catch_count: number; };
readonly doc_comment?: string;
readonly extends: readonly string[];
readonly fqn: string;
readonly implements: readonly string[];
readonly kind?: string;
readonly level?: string;
readonly members: readonly { readonly fqn: string; readonly kind: string; readonly signature?: string; readonly summary_short?: string; }[];
readonly name?: string;
readonly signature?: string;
readonly statements: readonly { readonly children: readonly Record<string, unknown>[]; readonly condition?: string; readonly depth: number; readonly embedding?: Record<string, unknown>; readonly end_line?: number; readonly expression: string; readonly id: string; readonly in_lambda: boolean; readonly in_loop: boolean; readonly kind: string; readonly parent_symbol_id: string; readonly receiver?: string; readonly references: readonly { readonly kind: string; readonly name: string; readonly resolved_id?: string; }[]; readonly start_line: number; }[];
readonly summary_short?: string;
readonly top_callees: readonly { readonly fqn: string; readonly kind: string; readonly signature?: string; readonly summary_short?: string; }[];
readonly top_callers: readonly { readonly fqn: string; readonly kind: string; readonly signature?: string; readonly summary_short?: string; }[];
readonly truncated: boolean;
}>;
/** `symbol_source` - Deterministic source citation for a symbol. Returns file path, lines, code, SHA-256, and stable flag. */
symbolSource(input?: {
fqn?: string;
max_lines?: number;
mode?: string;
statement_id?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly end_line: number;
readonly fqn: string;
readonly language: string;
readonly markdown_ready_block: string;
readonly sha256: string;
readonly short_sha: string;
readonly source: string;
readonly stable: boolean;
readonly start_line: number;
readonly truncated: boolean;
readonly virtual_file_path: string;
}>;
/** `token_budget` - Return the current model's context window size, used tokens (split by kind: system, user, assistant, tool, other), and available budget. */
tokenBudget(input?: Record<string, never>, ctx?: ExecutionContext): Promise<{
readonly available_tokens: number;
readonly context_window_tokens: number;
readonly model: string;
readonly used_tokens: number;
readonly used_tokens_by_kind: { readonly assistant: number; readonly other: number; readonly system: number; readonly tool: number; readonly user: number; };
}>;
/** `txt_search` - Perform semantic search within plain text (.txt) files using RAG embeddings. */
txtSearch(input: {
/** Maximum chunk size in characters (default: 500) */
chunk_size?: number;
/** File or directory path to search within */
path: string;
/** Semantic search query */
query: string;
/** Minimum similarity threshold 0-1 (default: 0.3) */
threshold?: number;
/** Number of top results to return (default: 5) */
top_k?: number;
}, ctx?: ExecutionContext): Promise<{
readonly files_processed: number;
readonly query: string;
readonly result_count: number;
readonly results: readonly { readonly approximate_line: number; readonly chunk_index: number; readonly content: string; readonly score: number; readonly source_file: string; }[];
readonly total_chunks: number;
}>;
/** `wait_for_event` - Wait for the next event on a topic. Requires exactly one of timeout_ms / wait_forever. */
waitForEvent(input: {
/** Optional metadata match constraints */
metadata_match?: Record<string, string> | null;
/** Wait timeout in ms (mutually exclusive with wait_forever) */
timeout_ms?: number | null;
/** Topic to wait on */
topic: string;
/** Wait indefinitely (mutually exclusive with timeout_ms) */
wait_forever?: boolean;
}, ctx?: ExecutionContext): Promise<{
readonly message?: { readonly correlation_id?: string; readonly message_id: string; readonly metadata: Record<string, string>; readonly payload?: unknown; readonly published_at: string; readonly source_agent_id?: string; readonly source_crew_id: string; readonly topic: string; };
readonly timed_out: boolean;
}>;
/** `web_scrape` - Scrape a web page. cached=false returns full text; cached=true chunks+embeds+stores the page in the RAG cache and returns only a short summary (use cache_search to retrieve chunks). */
webScrape(input: {
/** When true, chunk + embed + store in the RAG cache and return a short summary instead of full content. Query chunks back via cache_search. */
cached?: boolean;
/** Maximum chunk size in characters when cached=true (default 1500) */
chunk_size?: number;
/** Optional CSS/XPath selector to filter content */
selector?: string | null;
/** The URL of the web page to scrape */
url: string;
}, ctx?: ExecutionContext): Promise<{
readonly cached: boolean;
readonly content: string;
readonly content_length: number;
readonly key_prefix: string;
readonly selector_matched: boolean;
readonly summary: string;
readonly title: string;
readonly total_chunks: number;
readonly url?: string;
}>;
/** `web_search` - Search the web using the Tavily Search API. Returns relevant results with titles, URLs, content snippets, and scores. */
webSearch(input: {
/** Maximum number of results to return (default: 5) */
max_results?: number;
/** The search query text */
query: string;
/** Search depth: basic or advanced (default: basic) */
search_depth?: string;
}, ctx?: ExecutionContext): Promise<{
readonly query: string;
readonly result_count: number;
readonly results: readonly { readonly content: string; readonly score: number; readonly title: string; readonly url?: string; }[];
}>;
/** `xlsx_reader` - Read Excel (.xlsx) files and return structured data including sheets, rows, columns, and metadata. */
xlsxReader(input: {
/** Path to the .xlsx file to read */
file_path: string;
/** Whether to treat first row as header */
has_header_row?: boolean;
/** Whether to include workbook metadata */
include_metadata?: boolean;
/** Specific sheet to read (empty = all sheets) */
sheet_name?: string;
}, ctx?: ExecutionContext): Promise<{
readonly metadata: Record<string, string>;
readonly sheet_count: number;
readonly sheet_names: readonly string[];
readonly sheets: readonly { readonly column_count: number; readonly headers: readonly string[]; readonly name: string; readonly row_count: number; readonly rows: readonly (readonly string[])[]; }[];
}>;
/** `xlsx_writer` - Create or update Excel (.xlsx) files with structured data including multiple sheets, headers, and rows. */
xlsxWriter(input: {
/** Whether to append sheets to an existing file */
append_to_existing?: boolean;
/** Output file path for the .xlsx */
file_path: string;
/** Sheets to write (each with name, headers, rows) */
sheets: readonly { readonly headers?: readonly string[]; readonly name: string; readonly rows?: readonly (readonly string[])[]; }[];
}, ctx?: ExecutionContext): Promise<{
readonly file_path: string;
readonly file_size: number;
readonly sheet_count: number;
readonly success: boolean;
}>;
/** `xml_parser` - Parse XML data from files or strings with XPath query support. */
xmlParser(input: {
/** File path to an XML file, or an XML string */
input: string;
/** Operation to perform: Parse or Query */
operation?: string;
/** Optional XPath expression to query specific elements */
xpath?: string | null;
}, ctx?: ExecutionContext): Promise<{
readonly attribute_count?: number;
readonly attributes?: Record<string, unknown>;
readonly child_count?: number;
readonly children?: readonly { readonly attributes: Record<string, unknown>; readonly name: string; readonly value: string; }[];
readonly declaration?: string;
readonly match_count?: number;
readonly matches?: readonly { readonly attributes: Record<string, unknown>; readonly name: string; readonly value: string; }[];
readonly namespace?: string;
readonly root_element?: string;
readonly source?: string;
readonly xpath?: string;
}>;
}
}
export { };
