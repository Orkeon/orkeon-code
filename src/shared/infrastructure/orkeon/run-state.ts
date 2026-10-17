/// <reference path="../../../crews/.orkeon/orkeon.d.ts" />
// RunState adapter over the running agent's state (`ctx.state`). The state is
// read from the context at every call, never kept, so a read sees the last
// mutation. `ctx.state.with` is the runtime's only mutation path (a direct
// assignment throws), and it replaces the whole state, so a write carries the
// other fields over.

import type { RunState } from "../../application/ports.ts";

export function createRunState(ctx: Pick<AgentContext<Record<string, unknown>>, "state">): RunState {
  return {
    read: (field) => (ctx.state as Record<string, unknown> | undefined)?.[field],
    async write(field, value) {
      await ctx.state.with((s) => ({ ...s, [field]: value }));
    },
  };
}
