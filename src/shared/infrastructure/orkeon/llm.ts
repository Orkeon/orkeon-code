/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// Llm adapter over the running agent's `ctx.llm` facade. The facade belongs to
// the context the runtime hands each agent body, not to a global, so the entry
// point passes it in (`createLlm(ctx.llm)`) rather than wiring.ts binding it.
// This is the one place that turns the port's settings into the runtime's call
// options, and the one place that reads an act() result. A call the provider
// failed comes back as the host's failure marker: it is thrown as an LlmFailure,
// never returned as an answer.

import type { ActRequest, Llm, ModelOverride } from "../../application/ports.ts";
import type { PermissionMode } from "../../domain/permission-modes.ts";
import { llmFailureOf } from "../../domain/llm-failure.ts";

/** The request as the callers fill it: its mode is one of PERMISSION_MODES, the
 *  five modes ActOptions names (`dontAsk` among them since Orkeon 1.0.0-rc.6). */
type ModeActRequest = Omit<ActRequest, "permissionMode"> & { permissionMode?: PermissionMode };

/** The runtime's per-call options for a model override; none without one. */
function callOptions(override: ModelOverride | undefined): LlmCallOptions | undefined {
  return override?.model ? { llm: { model: override.model } } : undefined;
}

/** The runtime's act() options: the request as given, its model as the `llm` patch. */
function actOptions(request: ActRequest): ActOptions {
  const { model, ...rest } = request as ModeActRequest;
  return model ? { ...rest, llm: { model } } : rest;
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

export function createLlm(llm: Pick<LlmFacade, "act" | "complete" | "extract">): Llm {
  return {
    async act(prompt, request) {
      return answerOrThrow(answerOf(await llm.act(prompt, actOptions(request))));
    },
    async complete(prompt, override) {
      return answerOrThrow(await llm.complete(prompt, callOptions(override)));
    },
    extract: (prompt, schema) => llm.extract<unknown>(prompt, schema as JsonSchema),
  };
}
