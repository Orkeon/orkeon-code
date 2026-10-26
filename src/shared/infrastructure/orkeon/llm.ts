/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// Llm adapter over the running agent's `ctx.llm` facade. The facade belongs to
// the context the runtime hands each agent body, not to a global, so the entry
// point passes it in (`createLlm(ctx.llm)`) rather than wiring.ts binding it.
// This is the one place that turns the port's settings into the runtime's call
// options, and the one place that reads an act() result. A call the provider
// failed comes back as the host's failure marker: it is thrown as an LlmFailure,
// never returned as an answer. A crew that guards its tool calls hands its callbacks
// (shared/application/dev/tool-callbacks.ts) as the second argument: each act then carries the
// onToolCall/onToolResult built for its own mode. The request's `effort` is the runtime's
// `act({effort})` as it is; the crew's own level, when it has one, fills a request that names none.

import type { ActRequest, CompleteRequest, Llm, ModelOverride } from "../../application/ports.ts";
import type { PermissionMode } from "../../domain/permission-modes.ts";
import { llmFailureOf } from "../../domain/llm-failure.ts";
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
 *  carries none (a host resolving to a bare string); empty when nothing came back. */
function answerOf(result: unknown): string {
  const r = result as { output?: unknown } | null | undefined;
  return String(r?.output ?? r ?? "");
}

/** The model's text; the failure it stands for, thrown, when it is the host's marker. */
function answerOrThrow(text: string): string {
  const failure = llmFailureOf(text);
  if (failure) throw failure;
  return text;
}

export function createLlm(
  llm: Pick<LlmFacade, "act" | "complete" | "extract" | "chat"> & Partial<Pick<LlmFacade, "permissionGate">>,
  callbacks?: Pick<ToolCallbacks, "forAct">,
  defaults: Pick<ActRequest, "effort"> = {},
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
      return answerOrThrow(answerOf(await llm.act(prompt, actOptions(withEffort, callbacks, permissionGateEnabled()))));
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
