// An agent builder on the host profile the crew input names: `llmProfile`, the session's `llm.profile` the
// command read (shared/domain/llm-profile.ts). Every composition root starts its agents at wiring.ts
// orkeonAgent(), which hands this the runtime's factories, child agents included: one session key moves every
// agent of every crew onto a decision profile (Jev in front of an LLM profile) or another LLM profile. An input
// naming none gives the plain builder, on the host's default model. A name the host does not declare throws at
// the crew's load, as `llm.profile` does, listing the profiles the host knows. Every agent asks the provider to cache
// its system prompt and its tool definitions (Orkeon #254): the prompts are assembled so that this prefix stays
// byte-identical turn after turn. Only a provider whose cache is explicit (Anthropic) needs the request; the others
// cache by their own rules. An agent whose profile, or the host's default model, runs on a provider that takes no
// request (`agent-cli`, which warns at each call that asks one) requests none: the provider is `LlmConfig.provider`,
// the host's default read as `llm.profile("default")`. A sub-agent's act routed to a rung the host does not declare stays on the crew's profile
// (declaredRoute), as a crew launched on one does: the runtime throws on an unknown profile name an
// `InvalidScriptError` (Orkeon #364, #366), which `refusal` recognises. Any other failure of `llm.profile` is no
// undeclared name: it is thrown as it came.

import { llmProfileFallbackOf, llmProfileOf, takesPromptCache } from "../../domain/llm-profile.ts";
import { noLlmNamespace } from "./messages.ts";
import type { ActRoute } from "../../application/agents/route-agent.ts";

/** What building a profiled agent needs of the runtime: the agent builder, `llm.profile`, absent where the host
 *  declares no `llm`, and `refusal`, whether an error is the runtime refusing what the script asked. */
export interface AgentFactories {
  agent: () => any;
  profile: ((name: string) => LlmConfig) | undefined;
  refusal: (error: unknown) => boolean;
}

/** The agent factories over what the runtime plants: `agent`, the agent builder; `host`, its `llm` namespace, absent
 *  where it declares none (no `profile` then); `invalidScript`, the class of its refusals, absent where it plants none
 *  (no error is a refusal then). */
export function agentFactories(
  agent: () => any, host: { profile(name: string): LlmConfig } | undefined, invalidScript: (abstract new (...args: any[]) => unknown) | undefined,
): AgentFactories {
  return {
    agent,
    profile: host === undefined ? undefined : (name) => host.profile(name),
    refusal: (error) => invalidScript !== undefined && error instanceof invalidScript,
  };
}

/** The prompt cache every agent requests: the system prompt and the tools, for the vendor's default lifetime. */
export const PROMPT_CACHE: LlmCacheOptions = { systemPrompt: true, tools: true };
/** The name `llm.profile` takes for the host's own provider. */
const DEFAULT_PROFILE = "default";

export function profiledAgent(input: Readonly<Record<string, unknown>>, factories: AgentFactories): any {
  const builder = factories.agent();
  const config = profileConfigOf(input, factories);
  const configured = config === null ? builder : builder.llm(config);
  return takesPromptCache(config === null ? defaultProvider(factories) : config.provider)
    ? configured.cache(PROMPT_CACHE)
    : configured;
}

/** The host profile the input names, or null for the host's default model. */
function profileConfigOf(input: Readonly<Record<string, unknown>>, factories: AgentFactories): LlmConfig | null {
  const name = llmProfileOf(input);
  if (name === null) return null;
  if (factories.profile === undefined) throw new Error(noLlmNamespace(name));
  const fallback = llmProfileFallbackOf(input);
  if (fallback === undefined) return factories.profile(name);
  // A routed name the host does not declare: the crew runs as it would have without the routing.
  try {
    return factories.profile(name);
  } catch (error) {
    if (!factories.refusal(error)) throw error;
    return fallback === null ? null : factories.profile(fallback);
  }
}

/** The provider of the host's default model; undefined on a host without `llm`, or when the runtime cannot say. */
function defaultProvider({ profile }: AgentFactories): string | undefined {
  if (profile === undefined) return undefined;
  try {
    return profile(DEFAULT_PROFILE).provider;
  } catch {
    return undefined;
  }
}

/** `route`, moving no act to a profile the host does not declare (or on a host without `llm`); the level it answers
 *  stands. */
export function declaredRoute(route: ActRoute, { profile, refusal }: Pick<AgentFactories, "profile" | "refusal">): ActRoute {
  return async (task) => {
    const routed = await route(task);
    if (routed.profile === null) return routed;
    if (profile === undefined) return { ...routed, profile: null };
    try {
      profile(routed.profile);
      return routed;
    } catch (error) {
      if (!refusal(error)) throw error;
      return { ...routed, profile: null };
    }
  };
}
