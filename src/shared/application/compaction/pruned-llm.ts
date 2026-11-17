// An Llm whose acts carry the pruning of their tool loop (prune-context.ts, ADR 0032): the crews whose acts are made
// by a use case that knows nothing of the pruning (the sub-agents and the roles of the dev crews) get it from the
// Llm they are handed. Each act asks for its own binding, on its prompt. It adds nothing, and the request leaves as
// it came, when the binding is empty (the setting off, no decision model), when asking for it fails, and when the
// request already carries a callback of its own.
import type { ActRequest, Llm } from "../ports.ts";
import type { ContextPruning } from "./prune-context.ts";

/** What binds the pruning of one act working on `request`: `contextPruning` over the entry point's ports. */
export type PruningFor = (request: string) => Promise<ContextPruning>;

async function bindingOf(prune: PruningFor, prompt: string): Promise<ContextPruning> {
  try {
    return await prune(prompt);
  } catch {
    return {};
  }
}

async function prunedRequest(prune: PruningFor, prompt: string, request: ActRequest): Promise<ActRequest> {
  if (request.onContextPressure !== undefined) return request;
  const binding = await bindingOf(prune, prompt);
  return binding.onContextPressure === undefined ? request : { ...request, ...binding };
}

/** `llm` with the pruning `prune` binds on each of its acts; its other calls unchanged. */
export function prunedLlm(llm: Llm, prune: PruningFor): Llm {
  return {
    act: async (prompt, request) => llm.act(prompt, await prunedRequest(prune, prompt, request)),
    complete: (prompt, request) => llm.complete(prompt, request),
    extract: (prompt, schema) => llm.extract(prompt, schema),
    permissionGateEnabled: () => llm.permissionGateEnabled(),
    effortSent: (request) => llm.effortSent(request),
  };
}
