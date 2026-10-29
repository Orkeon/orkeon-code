// The cases of shared/domain/llm-profile.ts: what is a profile name, and what a crew input names.
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
];

export const INPUT_PROFILES: readonly { readonly name: string; readonly input: Record<string, unknown>; readonly profile: string | null }[] = [
  { name: "names the profile the input carries", input: { prompt: "hi", llmProfile: "guarded" }, profile: "guarded" },
  { name: "trims the name", input: { llmProfile: " guarded " }, profile: "guarded" },
  { name: "names none on an input without the field", input: { prompt: "hi" }, profile: null },
  { name: "names none on a field that is not a string", input: { llmProfile: 3 }, profile: null },
  { name: "names none on a field that is not a profile name", input: { llmProfile: "a b" }, profile: null },
];
