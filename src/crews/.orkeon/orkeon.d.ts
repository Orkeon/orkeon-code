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
* offer — a typo is never run as a loop without that tool. Names match case-insensitively.
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
* System prompt seeded as the first message of the tool-call conversation.
* Wins over any `SystemMessage` set in the provider configuration (the
* conversation-level message has precedence on every provider). Omitted:
* the conversation starts with the user prompt alone, as before.
*/
system?: string;
/**
* Permission mode gating each autonomous tool call (when the host registered a
* permission gate). Default: "default" (ask; denied in non-interactive sessions).
*/
permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
/**
* Called with each streamed content delta of the assistant turns (when the provider
* supports SSE streaming). Keep it cheap — rendering/logging only.
*/
onDelta?: (delta: string) => void;
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
*/
delegate<T = unknown>(agent: string | Agent<unknown, T>, input: unknown): Promise<T>;
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
runAgent<TIn, TOut>(agent: string | Agent<TIn, TOut>, input: TIn, opts?: CrewRunOptions): Promise<TOut>;
runStream(opts?: CrewRunOptions): AsyncIterable<CrewStreamEvent>;
add(agent: Agent<unknown, unknown>): void;
remove(agent: Agent<unknown, unknown> | string): void;
has(agent: Agent<unknown, unknown> | string): boolean;
findByName(name: string): Agent<unknown, unknown> | undefined;
findById(id: string): Agent<unknown, unknown> | undefined;
findByRole(role: string): readonly Agent<unknown, unknown>[];
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
readonly tokens?: number;
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
*/
execute(fn: (input: TIn, ctx?: unknown) => Promise<TOut> | TOut): this;
/**
* Declared access class for permission gates. Undeclared tools are
* treated fail-closed (as writes) by gated autonomous calls.
*/
access(value: "read" | "edit" | "execute"): this;
build(): Tool<TIn, TOut>;
}
function toolBuilder<TIn = unknown, TOut = unknown>(): ToolBuilder<TIn, TOut>;
}
export { };
// Orkeon Scripting DSL — Built-in tools namespace
// Surface mirrors `IBaseTool` implementations under `Orkeon.Tools.*`. The exhaustive
// signatures land alongside each builtin tool in SCR-11.
declare global {
/**
* The `tools` object: every registered `IBaseTool`, reachable by name.
*
* The named members below are the built-ins with a settled signature. Tools not
* enumerated are still reachable at runtime — hence the index signature, which is what
* forces this to be ONE interface rather than a namespace plus a fallback declaration.
*
* It has been wrong twice. First as an index signature written inside a `namespace`,
* which is not a declaration TypeScript accepts at all — the file did not parse, so the
* whole namespace was unavailable to every editor that loaded it. Then as a `namespace
* tools` beside a `const tools`, which do not merge either (TS2300 duplicate identifier,
* TS2395 merged declarations must be all exported or all local). Both survived because
* the only test over the shipped typings ran them through esbuild — a transpiler, which
* strips types and reports neither error. The test type-checks now.
*/
interface OrkeonTools {
fileRead(input: { path: string; encoding?: string }, ctx?: ExecutionContext): Promise<{ content: string }>;
fileWrite(input: { path: string; content: string }, ctx?: ExecutionContext): Promise<{ bytes: number }>;
directoryRead(input: { path: string; recursive?: boolean }, ctx?: ExecutionContext): Promise<{ entries: readonly string[] }>;
webScrape(input: { url: string; selector?: string }, ctx?: ExecutionContext): Promise<{ html: string }>;
httpApi(input: { url: string; method?: string; body?: unknown; headers?: Record<string, string> }, ctx?: ExecutionContext): Promise<{ status: number; body: unknown }>;
searchTool(input: { query: string; topK?: number }, ctx?: ExecutionContext): Promise<{ results: readonly unknown[] }>;
databaseQuery(input: { connection: string; sql: string; params?: readonly unknown[] }, ctx?: ExecutionContext): Promise<{ rows: readonly Record<string, unknown>[] }>;
delegateWork(input: { agent: string; task: string }, ctx?: ExecutionContext): Promise<{ output: unknown }>;
askQuestion(input: { question: string }, ctx?: ExecutionContext): Promise<{ answer: string }>;
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
/** Any other registered tool, by name. */
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
}
export { };
