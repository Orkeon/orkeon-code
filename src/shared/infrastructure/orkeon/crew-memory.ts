/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// CrewMemory adapter over the running agent's crew-scoped memory
// (`ctx.memory.crew`). Like the state, it belongs to the context each agent body
// receives, so the entry point builds it (`createCrewMemory(ctx)`).

import type { CrewMemory } from "../../application/ports.ts";

export function createCrewMemory(ctx: Pick<AgentContext, "memory">): CrewMemory {
  return {
    store: (key, value) => ctx.memory.crew.store(key, value),
  };
}
