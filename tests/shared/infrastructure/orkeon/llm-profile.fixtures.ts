// The agent factories profiledAgent builds over (wiring.ts hands it the runtime's): a builder that records the LLM config and the cache it is given,
// and a `llm.profile` that answers a config naming the profile (or none, as a command engine declares no `llm`).
import type { AgentFactories } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";

export class RecordingAgentBuilder {
  configs: LlmConfig[] = [];
  caches: LlmCacheOptions[] = [];

  llm(config: LlmConfig): this {
    this.configs.push(config);
    return this;
  }

  cache(options: LlmCacheOptions): this {
    this.caches.push(options);
    return this;
  }
}

/** A config as `llm.profile(name)` answers it. */
export const profileConfig = (name: string): LlmConfig => ({ provider: "host", profile: name, model: "", with: () => profileConfig(name) });

export function factories(withProfile = true, unknown: readonly string[] = []): AgentFactories & { built: RecordingAgentBuilder[] } {
  const built: RecordingAgentBuilder[] = [];
  const profile = (name: string): LlmConfig => {
    if (unknown.includes(name)) throw new Error(`unknown LLM profile '${name}'`);
    return profileConfig(name);
  };
  return {
    built,
    agent: () => { const builder = new RecordingAgentBuilder(); built.push(builder); return builder; },
    profile: withProfile ? profile : undefined,
  };
}

/** What a routed crew input builds on, the host declaring no profile `small`. */
export const FALLBACK_CASES: { name: string; input: Record<string, unknown>; profiles: string[] }[] = [
  { name: "builds a routed agent on the routed profile when the host declares it", input: { llmProfile: "large", llmProfileFallback: "" }, profiles: ["large"] },
  { name: "falls back on the session's profile when the host does not declare the routed one", input: { llmProfile: "small", llmProfileFallback: "large" }, profiles: ["large"] },
  { name: "falls back on the host's default model when the session named no profile", input: { llmProfile: "small", llmProfileFallback: "" }, profiles: [] },
];

/** The inputs every agent requests the prompt cache on: a profile named, or none. */
export const CACHE_CASES: { name: string; input: Record<string, unknown> }[] = [
  { name: "requests the prompt cache of the system prompt and the tools on a profile", input: { llmProfile: "guarded" } },
  { name: "requests the prompt cache of the system prompt and the tools on the host's default model", input: {} },
];

export const TASK = { crew: "dev-reviewer", brief: "Review the plan" };

/** What a route answers once checked against the host, which declares no profile `small`. */
export const DECLARED_ROUTES: { name: string; withProfile: boolean; answer: string | null; profile: string | null }[] = [
  { name: "keeps a route to a profile the host declares", withProfile: true, answer: "large", profile: "large" },
  { name: "drops a route to a profile the host does not declare", withProfile: true, answer: "small", profile: null },
  { name: "keeps a route that moves nothing as it is", withProfile: true, answer: null, profile: null },
  { name: "drops every route on a host without llm", withProfile: false, answer: "large", profile: null },
];
