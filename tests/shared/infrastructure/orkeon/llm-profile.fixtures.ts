// The agent factories profiledAgent builds over (wiring.ts hands it the runtime's): a builder that records the LLM config it is given, and a
// `llm.profile` that answers a config naming the profile (or none, as a command engine declares no `llm`).
import type { AgentFactories } from "../../../../src/shared/infrastructure/orkeon/llm-profile.ts";

export class RecordingAgentBuilder {
  configs: LlmConfig[] = [];

  llm(config: LlmConfig): this {
    this.configs.push(config);
    return this;
  }
}

/** A config as `llm.profile(name)` answers it. */
export const profileConfig = (name: string): LlmConfig => ({ provider: "host", profile: name, model: "", with: () => profileConfig(name) });

export function factories(withProfile = true): AgentFactories & { built: RecordingAgentBuilder[] } {
  const built: RecordingAgentBuilder[] = [];
  return {
    built,
    agent: () => { const builder = new RecordingAgentBuilder(); built.push(builder); return builder; },
    profile: withProfile ? profileConfig : undefined,
  };
}
