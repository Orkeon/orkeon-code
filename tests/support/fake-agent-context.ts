/// <reference path="../../src/crews/.orkeon/orkeon.d.ts" />
// FakeAgentContext: a stand-in for the agent context's `state` and crew memory, to
// test the RunState and CrewMemory adapters. Each read of `state` is a fresh
// read-only view of `fields`, as the runtime's is; `with` replaces `fields` with
// what the mutator returns and counts the mutation. `memory.crew.store` keeps its
// value in `crewMemory`.
export class FakeAgentContext {
  fields: Record<string, unknown> = {};
  mutations = 0;
  crewMemory = new Map<string, unknown>();

  get memory(): AgentContext["memory"] {
    const store = async (key: string, value: unknown) => {
      this.crewMemory.set(key, value);
    };
    return { crew: { store } } as unknown as AgentContext["memory"];
  }

  get state(): AgentState<Record<string, unknown>> {
    const view = { ...this.fields } as Record<string, unknown>;
    return Object.assign(view, {
      with: async (mutate: (prev: Readonly<Record<string, unknown>>) => Record<string, unknown> | Promise<Record<string, unknown>>) => {
        this.fields = await mutate({ ...this.fields });
        this.mutations++;
        return this.fields;
      },
    }) as AgentState<Record<string, unknown>>;
  }
}
