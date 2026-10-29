// An agent builder on the host profile the crew input names: `llmProfile`, the session's `llm.profile` the
// command read (shared/domain/llm-profile.ts). Every composition root starts its agents at wiring.ts
// orkeonAgent(), which hands this the runtime's factories, child agents included: one session key moves every
// agent of every crew onto a decision profile (Jev in front of an LLM profile) or another LLM profile. An input
// naming none gives the plain builder, on the host's default model. A name the host does not declare throws at
// the crew's load, as `llm.profile` does, listing the profiles the host knows.

import { llmProfileOf } from "../../domain/llm-profile.ts";

/** What building a profiled agent needs of the runtime: the agent builder and `llm.profile`, absent where the host declares no `llm`. */
export interface AgentFactories {
  agent: () => any;
  profile: ((name: string) => LlmConfig) | undefined;
}

export function profiledAgent(input: Readonly<Record<string, unknown>>, factories: AgentFactories): any {
  const builder = factories.agent();
  const name = llmProfileOf(input);
  if (name === null) return builder;
  if (factories.profile === undefined) throw new Error(`llm.profile '${name}': this host declares no llm namespace, no profile can be applied`);
  return builder.llm(factories.profile(name));
}
