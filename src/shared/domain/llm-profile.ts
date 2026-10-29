// The host profile the agents of the commands run on (`llm.profile`): one of the host's LLM profiles
// (`Llm:Profiles:<name>`) or decision profiles (`Orkeon:Decision:Profiles:<name>`, a decision model such
// as Jev in front of an LLM profile). The command reads the session key and hands the name to the crew
// in its input, under `llmProfile`; the crew's composition root builds every agent on it
// (shared/infrastructure/orkeon/llm-profile.ts). Omitted, the agents run on the host's default model,
// as they always did.

export const LLM_PROFILE_CONFIG_KEY = "llm.profile";
/** The field of a crew input that carries the profile's name. */
export const LLM_PROFILE_INPUT_KEY = "llmProfile";

/** Why a value is refused for `llm.profile`; undefined when it is a profile name. */
export function llmProfileProblem(value: string): string | undefined {
  const name = value.trim();
  if (name === "") return "a profile name is expected";
  if (/\s/.test(name)) return `'${value}' holds a space: a profile is one name, as the host's settings spell it`;
  if (name.includes(":")) return `'${value}' holds a colon: name the profile alone, not its settings path`;
  return undefined;
}

/** The profile a crew input names, or null when it names none or the name is not one. */
export function llmProfileOf(input: Readonly<Record<string, unknown>>): string | null {
  const value = input[LLM_PROFILE_INPUT_KEY];
  return typeof value === "string" && llmProfileProblem(value) === undefined ? value.trim() : null;
}
