// An agent builder on the host profile the crew input names: `llmProfile`, the session's `llm.profile` the
// command read (shared/domain/llm-profile.ts). Every composition root starts its agents at wiring.ts
// orkeonAgent(), which hands this the runtime's factories, child agents included: one session key moves every
// agent of every crew onto a decision profile (Jev in front of an LLM profile) or another LLM profile. An input
// naming none gives the plain builder, on the host's default model. A name the host does not declare throws at
// the crew's load, as `llm.profile` does, listing the profiles the host knows. Every agent asks the provider to cache
// its system prompt and its tool definitions (Orkeon #254): the prompts are assembled so that this prefix stays
// byte-identical turn after turn. Only a provider whose cache is explicit (Anthropic) needs the request; the others
// cache by their own rules. A runtime before Orkeon #256 (the rc.6 release, the tool and docker modes) has no `cache`
// on its builder: the agent is then built without the request rather than failing at the crew's load. The same
// absence tells a runtime whose act() does not read `context` (Orkeon #277, after #256): the main loop's adapter then
// sends the context in front of the request rather than have it dropped.

import { llmProfileOf } from "../../domain/llm-profile.ts";

/** What building a profiled agent needs of the runtime: the agent builder and `llm.profile`, absent where the host declares no `llm`. */
export interface AgentFactories {
  agent: () => any;
  profile: ((name: string) => LlmConfig) | undefined;
}

/** The prompt cache every agent requests: the system prompt and the tools, for the vendor's default lifetime. */
export const PROMPT_CACHE: LlmCacheOptions = { systemPrompt: true, tools: true };

/** Whether the runtime's act() reads `context`: the builder has `.cache`, which the rc.6 release (before #256, so before
 *  #277) lacks. A source checkout between #256 and #277 answers true; the launcher moves such a checkout to the pin. */
export function runtimeTakesActContext(factories: Pick<AgentFactories, "agent">): boolean {
  return typeof factories.agent().cache === "function";
}

export function profiledAgent(input: Readonly<Record<string, unknown>>, factories: AgentFactories): any {
  const plain = factories.agent();
  const builder = typeof plain.cache === "function" ? plain.cache(PROMPT_CACHE) : plain;
  const name = llmProfileOf(input);
  if (name === null) return builder;
  if (factories.profile === undefined) throw new Error(`llm.profile '${name}': this host declares no llm namespace, no profile can be applied`);
  return builder.llm(factories.profile(name));
}
