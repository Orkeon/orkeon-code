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
// The request's `context` is the runtime's `act({context})` (Orkeon #276); a runtime that does not read
// that option (the rc.6 release, the tool and docker modes) would drop it without a word, so there the
// context is put back in front of the prompt, in one message, as it was before.

import type { ActRequest, CompleteRequest, Llm, ModelOverride } from "../../application/ports.ts";
import type { PermissionMode } from "../../domain/permission-modes.ts";
import { budgetExhaustedAnswer, llmFailureOf } from "../../domain/llm-failure.ts";
import type { ToolCallbacks } from "../../application/dev/tool-callbacks.ts";

/** The request as the callers fill it: its mode is one of PERMISSION_MODES, the
 *  five modes ActOptions names (`dontAsk` among them since Orkeon 1.0.0-rc.6). */
type ModeActRequest = Omit<ActRequest, "permissionMode"> & { permissionMode?: PermissionMode };

/** The runtime's per-call options for a model override; none without one. */
function callOptions(override: ModelOverride | undefined): LlmCallOptions | undefined {
  return override?.model ? { llm: { model: override.model } } : undefined;
}

/** The runtime's act() options: the request as given (its `tools` subset copied), its model as the `llm` patch, and the crew's callbacks for
 *  the act's mode (`default` when the request names none, as the runtime reads it). */
function actOptions(request: ActRequest, callbacks: Pick<ToolCallbacks, "forAct"> | undefined, gateEnabled: boolean | undefined): ActOptions {
  const { model, tools, ...given } = request as ModeActRequest;
  const rest = tools === undefined ? given : { ...given, tools: [...tools] };
  const options: ActOptions = model ? { ...rest, llm: { model } } : rest;
  return callbacks === undefined
    ? options
    : { ...options, ...callbacks.forAct(request.permissionMode ?? "default", gateEnabled) };
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

/** What the adapter adds to every act: the crew's effort, and whether the runtime reads `act({context})`. */
export interface LlmDefaults extends Pick<ActRequest, "effort"> {
  /** False on a runtime before Orkeon #277: the context goes in front of the prompt. True when absent. */
  contextApart?: boolean;
}

/** The prompt and request the runtime receives: the context apart when it reads it, else in front of the prompt. */
function withContext(prompt: string, request: ActRequest, contextApart: boolean): { prompt: string; request: ActRequest } {
  const { context, ...rest } = request;
  if (context === undefined || context.trim().length === 0) return { prompt, request: rest };
  return contextApart ? { prompt, request } : { prompt: context + "\n\n" + prompt, request: rest };
}

export function createLlm(
  llm: Pick<LlmFacade, "act" | "complete" | "extract" | "chat"> & Partial<Pick<LlmFacade, "permissionGate">>,
  callbacks?: Pick<ToolCallbacks, "forAct">,
  defaults: LlmDefaults = {},
): Llm {
  const permissionGateEnabled = (): boolean | undefined => {
    // The runtime always sets it; a facade without it (a test's) cannot say.
    const on = llm.permissionGate?.enabled;
    return on === true || on === false ? on : undefined;
  };
  return {
    permissionGateEnabled,
    async act(prompt, request) {
      // The crew's effort (/effort, handed as an input) when the request names none.
      const effort = request.effort ?? defaults.effort;
      const withEffort = effort === undefined ? request : { ...request, effort };
      const sent = withContext(prompt, withEffort, defaults.contextApart ?? true);
      return answerOrThrow(answerOf(await llm.act(sent.prompt, actOptions(sent.request, callbacks, permissionGateEnabled()))));
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
