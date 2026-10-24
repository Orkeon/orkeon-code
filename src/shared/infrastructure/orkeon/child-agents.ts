/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// The children of a crew run (A-3) over the runtime: `ctx.spawnBackground`, the crew's
// `instances()`/`stop()`, the crew's memory and `ctx.receive({ timeout })` as the pause (it
// rejects with a ReceiveTimeoutError when nothing arrives, which is the whole point here). The
// crew entry builds them from the context its body receives and the crew object it published;
// withChildAct hands the use cases an Llm whose act runs in such a child, the rest unchanged.

import type { ActRequest, ChildRuntime, Llm, Logger } from "../../application/ports.ts";
import { createChildBoard, instanceKey, parseChildInput, runChildAct } from "../../application/agents/child-agent.ts";
import type { BoardDeps, ChildBoard } from "../../application/agents/child-agent.ts";
import { createLlm } from "./llm.ts";
import type { ToolCallbacks } from "./tool-callbacks.ts";

type ChildContext = Pick<AgentContext, "spawnBackground" | "memory" | "receive">;
type ChildCrew = Pick<Crew, "instances" | "stop">;

const firstLine = (error: unknown): string => String((error as Error)?.message ?? error).split("\n")[0];

/** A rejection of `receive` that is its timeout, the expected end of a pause. */
function isTimeout(error: unknown): boolean {
  const e = error as { name?: unknown; message?: unknown; code?: unknown } | null;
  return /timeout/i.test(`${e?.name ?? ""} ${e?.code ?? ""} ${e?.message ?? error}`);
}

/** The runtime's children for this run; null on a host without background children (the act then runs inline, A1). */
export function createChildRuntime(ctx: ChildContext, crew: ChildCrew): ChildRuntime | null {
  if (typeof ctx.spawnBackground !== "function" || typeof crew?.instances !== "function") return null;
  return {
    spawn(agent, input) {
      ctx.spawnBackground(agent, input);
    },
    instances: () => [...crew.instances()].map((i) => ({ id: String(i.id), agent: String(i.agent), state: String(i.state) })),
    stop: (id) => id !== "" && crew.stop(id) === true,
    read: (key) => ctx.memory.crew.get(key),
    async pause(ms) {
      try {
        // Nothing sends the parent an event; one that arrives anyway is left unread.
        await ctx.receive({ timeout: ms });
      } catch (error) {
        if (!isTimeout(error)) throw error;
      }
    },
  };
}

/**
 * The body of a child agent: it acts on the call its input carries, under the callbacks of its
 * step, and leaves the outcome in the crew's memory for the parent before it returns.
 */
export function childAgentBody(
  callbacksFor: (ctx: AgentContext) => ToolCallbacks | undefined,
): (input: unknown, ctx: AgentContext) => Promise<string> {
  return async (input, ctx) => {
    const call = parseChildInput(input);
    if (call === null) throw new Error("child agent: its input is not a child call");
    // The parent cannot match the runtime's rows by agent name (they hold the agent's id): say which instance this is.
    if (typeof ctx.instanceId === "string") await ctx.memory.crew.store(instanceKey(call.key), ctx.instanceId).catch(() => undefined);
    try {
      const reply = await createLlm(ctx.llm, callbacksFor(ctx)).act(call.prompt, call.request);
      await ctx.memory.crew.store(call.key, { ok: true, reply });
      return reply;
    } catch (error) {
      await ctx.memory.crew.store(call.key, { ok: false, error: firstLine(error) }).catch(() => undefined);
      throw error;
    }
  };
}

export interface ChildActSpec {
  /** The crew agent the child runs as, added to the crew by `ctx.spawn(builder())` at its first act. */
  agent: string;
  charter: string;
  task: string;
  builder: () => AgentBuilder;
}

/**
 * `base` with its act run by a background child (approach A2), or `base` itself, the act inline in
 * the same body (approach A1), when the host has no background children.
 */
export function withChildAct(
  base: Llm,
  ctx: ChildContext & Pick<AgentContext, "crew" | "spawn">,
  crew: ChildCrew,
  deps: { board: ChildBoard; clock: () => Date; log: Logger; effort?: ActRequest["effort"] },
  spec: ChildActSpec,
): Llm {
  const runtime = createChildRuntime(ctx, crew);
  if (runtime === null) {
    deps.log.warn(`${spec.agent}: this host runs no background child; the act runs inline in the step's own agent`);
    return base;
  }
  return {
    ...base,
    act(prompt: string, request: ActRequest) {
      if (!ctx.crew.has(spec.agent)) ctx.spawn(spec.builder());
      return runChildAct(
        { runtime, board: deps.board, clock: deps.clock, log: deps.log },
        {
          agent: spec.agent, charter: spec.charter, task: spec.task, prompt,
          // The crew's effort when the request names none, as createLlm fills it for an inline act.
          request: request.effort === undefined && deps.effort !== undefined ? { ...request, effort: deps.effort } : request,
        },
      );
    },
  };
}

/**
 * A step run whose act goes to a background child (A2), from its board to its close: the board
 * /tasks reads under `run.crew`, and withChildAct over it. The caller closes it once the run ended,
 * whatever the outcome (`finally`), so /tasks no longer shows the run as open.
 */
export function openChildAct(
  base: Llm,
  ctx: ChildContext & Pick<AgentContext, "crew" | "spawn">,
  crew: ChildCrew,
  deps: BoardDeps & { effort?: ActRequest["effort"] },
  run: { crew: string; step: string },
  spec: ChildActSpec,
): { llm: Llm; close: () => Promise<void> } {
  const board = createChildBoard({ state: deps.state, clock: deps.clock, log: deps.log }, run);
  const llm = withChildAct(base, ctx, crew, { board, clock: deps.clock, log: deps.log, effort: deps.effort }, spec);
  return { llm, close: () => board.close() };
}
