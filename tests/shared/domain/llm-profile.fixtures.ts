// The cases of shared/domain/llm-profile.ts: what is a profile name, and what a crew input names.
import { profileIsAuto } from "../../../src/shared/domain/messages.ts";
export const PROFILE_NAMES: readonly { readonly name: string; readonly value: string; readonly problem: string | undefined }[] = [
  { name: "accepts a plain name", value: "guarded", problem: undefined },
  { name: "accepts the reserved name of the host's default profile", value: "default", problem: undefined },
  { name: "accepts a name with spaces around it", value: "  cascade ", problem: undefined },
  { name: "refuses an empty value", value: "", problem: "a profile name is expected" },
  { name: "refuses a blank value", value: "   ", problem: "a profile name is expected" },
  { name: "refuses two names", value: "guarded cascade", problem: "'guarded cascade' holds a space: a profile is one name, as the host's settings spell it" },
  {
    name: "refuses a settings path", value: "Orkeon:Decision:Profiles:guarded",
    problem: "'Orkeon:Decision:Profiles:guarded' holds a colon: name the profile alone, not its settings path",
  },
  { name: "refuses the name the runtime reserves for its own pick, auto, in any case", value: " Auto ", problem: profileIsAuto(" Auto ") },
];

export const INPUT_PROFILES: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profile: string | null }[] = [
  { name: "names the profile the input carries", input: { prompt: "hi", llmProfile: "guarded" }, profile: "guarded" },
  { name: "trims the name", input: { llmProfile: " guarded " }, profile: "guarded" },
  { name: "names none on an input without the field", input: { prompt: "hi" }, profile: null },
  { name: "names none on a field that is not a string", input: { llmProfile: 3 }, profile: null },
  { name: "names none on a field that is not a profile name", input: { llmProfile: "a b" }, profile: null },
];

/** The session's own profile, as a crew input carries it: beside a routed profile, or as the profile itself. */
export const SESSION_PROFILES: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profile: string | null }[] = [
  { name: "names the fallback of a routed launch", input: { llmProfile: "small", llmProfileFallback: "large" }, profile: "large" },
  { name: "names the host's default model for a routed launch of a session without a profile", input: { llmProfile: "small", llmProfileFallback: "" }, profile: null },
  { name: "names the input's profile when the launch was not routed", input: { llmProfile: "large" }, profile: "large" },
  { name: "names the host's default model on an input without a profile", input: { prompt: "hi" }, profile: null },
];

/** Whether an agent on a provider requests the prompt cache. */
export const CACHE_PROVIDERS: readonly { readonly name: string; readonly provider: string | undefined; readonly takes: boolean }[] = [
  { name: "requests the prompt cache on a provider whose cache is explicit", provider: "anthropic", takes: true },
  { name: "requests the prompt cache when the provider is not known", provider: undefined, takes: true },
  { name: "requests no prompt cache on the agent-cli provider", provider: "agent-cli", takes: false },
  { name: "requests no prompt cache on the agent-cli provider whatever its case", provider: " Agent-CLI ", takes: false },
];

/** The profile of the agents the main turn spawns, as the main loop's input carries `agents.profile`. */
export const AGENTS_PROFILES: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profile: string | null }[] = [
  { name: "names the agents' profile the input carries", input: { llmProfile: "large", agentsLlmProfile: " subscription " }, profile: "subscription" },
  { name: "names no agents' profile on an input without the field", input: { llmProfile: "large" }, profile: null },
  { name: "names no agents' profile on a field that is not a profile name", input: { agentsLlmProfile: "a b" }, profile: null },
];

/** The input an agent the main turn spawns is built from. */
export const SPAWNED_INPUTS: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly spawned: Record<string, unknown> }[] = [
  {
    name: "puts a spawned agent on the agents' profile, over the turn's own",
    input: { prompt: "hi", llmProfile: "large", agentsLlmProfile: "subscription" },
    spawned: { prompt: "hi", llmProfile: "subscription", agentsLlmProfile: "subscription" },
  },
  {
    name: "puts a spawned agent on the agents' profile when the turn runs on the host's default model",
    input: { prompt: "hi", agentsLlmProfile: "subscription" },
    spawned: { prompt: "hi", llmProfile: "subscription", agentsLlmProfile: "subscription" },
  },
  {
    name: "leaves a spawned agent on the turn's own profile when the input names no agents' profile",
    input: { prompt: "hi", llmProfile: "large" },
    spawned: { prompt: "hi", llmProfile: "large" },
  },
  {
    name: "drops the routing's fallback mark from a spawned agent's input, the agents' profile being no routed pick",
    input: { llmProfile: "small", llmProfileFallback: "large", agentsLlmProfile: "subscription" },
    spawned: { llmProfile: "subscription", agentsLlmProfile: "subscription" },
  },
];

/** The profiles an act is routed between, by the crew input: a launch's own, and those of an agent the turn spawns. */
export const ACT_PROFILE_INPUTS: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profiles: { session: string | null; crew: string | null } }[] = [
  { name: "routes the acts of a crew under the session's profile, a routed crew's fallback", input: { llmProfile: "small", llmProfileFallback: "large" }, profiles: { session: "large", crew: "small" } },
  { name: "routes the acts of a crew on the host's default model with no ceiling", input: { prompt: "hi" }, profiles: { session: null, crew: null } },
];

/** The profiles the act of a spawned agent is routed between, by the turn's input. */
export const SPAWNED_ACT_PROFILE_INPUTS: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profiles: { session: string | null; crew: string | null } }[] = [
  {
    name: "routes a spawned agent's act under the agents' profile, never the turn's own",
    input: { llmProfile: "large", agentsLlmProfile: "small" }, profiles: { session: "small", crew: "small" },
  },
  {
    name: "routes a spawned agent's act under the agents' profile, the turn's routing fallback dropped",
    input: { llmProfile: "medium", llmProfileFallback: "large", agentsLlmProfile: "small" }, profiles: { session: "small", crew: "small" },
  },
  { name: "routes a spawned agent's act under the turn's profile when the input names no agents' profile", input: { llmProfile: "large" }, profiles: { session: "large", crew: "large" } },
];
