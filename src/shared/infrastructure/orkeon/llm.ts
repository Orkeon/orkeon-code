/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// Llm adapter over the running agent's `ctx.llm` facade. The facade belongs to
// the context the runtime hands each agent body, not to a global, so the entry
// point passes it in (`createLlm(ctx.llm)`) rather than wiring.ts binding it.
// This is the one place that turns the port's settings into the runtime's call
// options, and the one place that reads an act() result. A call the provider
// failed comes back as the host's failure marker: it is thrown as an LlmFailure,
// never returned as an answer. An act whose token budget ran out resolves with
// `budgetExhausted: true` and the wrap-up the model made without tools (Orkeon #218):
// it is thrown as a BudgetExhaustedAnswer carrying that answer, never returned, so the
// port's `act` keeps resolving to a finished answer alone, every caller that reads a
// spent budget off a rejection (runSubAgent, the dev roles, the auditor) keeps doing
// so under the `tokens` dimension, and the one caller that shows the wrap-up (the
// main loop) reads it off the error. A crew that guards its tool calls hands its callbacks
// (shared/application/dev/tool-callbacks.ts) as the second argument: each act then carries the
// onToolCall/onToolResult built for its own mode. The request's `effort` is the runtime's
// `act({effort})` as it is; the crew's own level, when it has one, fills a request that names none.
// `effortSent` asks the facade what such an act sends for its effort (`ctx.llm.reasoning`, Orkeon #360), without a call.
// The request's `context` is the runtime's `act({context})` (Orkeon #276), a blank one left out.
// Every act's callbacks, the crew's or none, sit inside the host's (hostCallbacks): under a host whose paths have
// another spelling, or with path lists, a call's paths come back to the VFS and are judged before the crew's
// callbacks see them, and every result's disk spellings come back before the model reads them. The host's context
// is this run's (orkeon/host-context.ts), read at the first act; a test hands its own in the defaults.

import type { ActRequest, CompleteRequest, Llm, ModelOverride } from "../../application/ports.ts";
import type { PermissionMode } from "../../domain/permission-modes.ts";
import { budgetExhaustedAnswer, llmFailureOf } from "../../domain/llm-failure.ts";
import { effortReportOf } from "../../domain/agent-policy/reasoning.ts";
import { hostCallbacks } from "../../application/dev/tool-callbacks.ts";
import type { ActCallbacks, ToolCallbacks } from "../../application/dev/tool-callbacks.ts";
import type { HostSource } from "../../application/host-context.ts";
import { orkeonHostContext } from "./host-context.ts";

/** The request as the callers fill it: its mode is one of PERMISSION_MODES, the
 *  five modes ActOptions names. */
type ModeActRequest = Omit<ActRequest, "permissionMode"> & { permissionMode?: PermissionMode };

/** The runtime's `llm` patch of one call: its profile and its model, each when set; none when neither is. */
function llmPatch(profile: string | undefined, model: string | undefined): { profile?: string; model?: string } | undefined {
  if (!profile && !model) return undefined;
  return { ...(profile ? { profile } : {}), ...(model ? { model } : {}) };
}

/** The runtime's per-call options for a model override; none without one. */
function callOptions(override: ModelOverride | undefined): LlmCallOptions | undefined {
  const llm = llmPatch(override?.profile, override?.model);
  return llm === undefined ? undefined : { llm };
}

/** The runtime's act() options: the request as given (its `tools` subset copied), its profile and model as the `llm`
 *  patch, and the act's callbacks, when it has any. */
function actOptions(request: ActRequest, callbacks: ActCallbacks | undefined): ActOptions {
  const { model, profile, tools, ...given } = request as ModeActRequest;
  const rest = tools === undefined ? given : { ...given, tools: [...tools] };
  const llm = llmPatch(profile, model);
  const options: ActOptions = llm === undefined ? rest : { ...rest, llm };
  return callbacks === undefined ? options : { ...options, ...callbacks };
}

/** The answer text of an act() result: its `output`; the result itself when it
 *  carries none (a host resolving to a bare string); empty when nothing came back.
 *  A result flagged `budgetExhausted` is thrown with its output as a BudgetExhaustedAnswer. */
function answerOf(result: unknown): string {
  const r = result as { output?: unknown; budgetExhausted?: unknown } | null | undefined;
  const text = String(r?.output ?? r ?? "");
  if (r?.budgetExhausted === true) throw budgetExhaustedAnswer(text);
  return text;
}

/** The model's text; the failure it stands for, thrown, when it is the host's marker. */
function answerOrThrow(text: string): string {
  const failure = llmFailureOf(text);
  if (failure) throw failure;
  return text;
}

/** What the adapter adds to every act: the crew's effort, and the host's context (this run's when none is given). */
export type LlmDefaults = Pick<ActRequest, "effort"> & { host?: HostSource };

/** The request the runtime receives: as given, a blank context left out. */
function withContext(request: ActRequest): ActRequest {
  const { context, ...rest } = request;
  return context === undefined || context.trim().length === 0 ? rest : request;
}

export function createLlm(
  llm: Pick<LlmFacade, "act" | "complete" | "extract" | "chat"> & Partial<Pick<LlmFacade, "permissionGate" | "reasoning">>,
  callbacks?: Pick<ToolCallbacks, "forAct">,
  defaults: LlmDefaults = {},
): Llm {
  const permissionGateEnabled = (): boolean | undefined => {
    // The runtime always sets it; a facade without it (a test's) cannot say.
    const on = llm.permissionGate?.enabled;
    return on === true || on === false ? on : undefined;
  };
  const host = defaults.host ?? orkeonHostContext;
  return {
    permissionGateEnabled,
    effortSent(request) {
      const effort = request.effort ?? defaults.effort;
      // A facade without it (a test's, a runtime before #360) cannot say. With no effort asked, the runtime reports
      // what the host's own configuration sends, or nothing.
      if (llm.reasoning === undefined) return null;
      try {
        return effortReportOf(llm.reasoning({ ...(effort === undefined ? {} : { effort }), ...callOptions(request) }));
      } catch {
        return null;
      }
    },
    async act(prompt, request) {
      // The crew's effort (/effort, handed as an input) when the request names none.
      const effort = request.effort ?? defaults.effort;
      const withEffort = effort === undefined ? request : { ...request, effort };
      // The crew's callbacks for the act's mode (`default` when the request names none, as the runtime reads it),
      // inside the host's.
      const own = callbacks?.forAct(request.permissionMode ?? "default", permissionGateEnabled());
      const acts = hostCallbacks(own, await host());
      return answerOrThrow(answerOf(await llm.act(prompt, actOptions(withContext(withEffort), acts))));
    },
    async complete(prompt, request?: CompleteRequest) {
      // A system message needs the message-array call: `complete` takes a prompt only.
      if (request?.system) {
        const reply = await llm.chat(
          [{ role: "system", content: request.system }, { role: "user", content: prompt }],
          callOptions(request),
        );
        return answerOrThrow(String(reply?.content ?? ""));
      }
      return answerOrThrow(await llm.complete(prompt, callOptions(request)));
    },
    extract: (prompt, schema) => llm.extract<unknown>(prompt, schema as JsonSchema),
  };
}
