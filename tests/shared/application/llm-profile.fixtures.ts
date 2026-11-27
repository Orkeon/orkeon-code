// A config store on FakeFiles for the profile readers: the user settings file holding `llm.profile`, `agents.profile`, or none.
import { createConfigStore, CONFIG_FILE_PATH, USER_CONFIG_FILE_PATH } from "../../../src/shared/application/config-store.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../support/doubles/fake-session-store.ts";

export function profileConfig(setting?: string) {
  const files = new FakeFiles();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  if (setting !== undefined) files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "llm.profile": setting }));
  return { files, config };
}

/** A config store whose project file is not JSON. */
export function malformedProjectConfig() {
  const { files, config } = profileConfig();
  files.files.set(CONFIG_FILE_PATH, "{ not json");
  return config;
}

export const UNREADABLE_WARNING = `llm.profile could not be read (${CONFIG_FILE_PATH} could not be read or parsed): the host's default model this launch`;
export const NOT_A_NAME_WARNING = "llm.profile: 'a b' holds a space: a profile is one name, as the host's settings spell it; the host's default model this launch";

/** A config store whose user settings file holds `settings`. */
export function settingsConfig(settings: Record<string, string>) {
  const files = new FakeFiles();
  files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify(settings));
  return createConfigStore({ files, session: new FakeSessionStore() });
}

export const AGENTS_NOT_A_NAME_WARNING = "agents.profile: 'a b' holds a space: a profile is one name, as the host's settings spell it; the agents follow llm.profile this launch";

export interface CrewProfileCase { name: string; settings: Record<string, string>; read: { profile: string | null; warnings: string[] } }

/** What a crew other than the main loop is launched on, from the two keys. */
export const CREW_PROFILE_CASES: readonly CrewProfileCase[] = [
  {
    name: "launches a crew on agents.profile, over llm.profile",
    settings: { "llm.profile": "large", "agents.profile": "subscription" }, read: { profile: "subscription", warnings: [] },
  },
  { name: "launches a crew on llm.profile when the session names no agents.profile", settings: { "llm.profile": "large" }, read: { profile: "large", warnings: [] } },
  { name: "launches a crew on the host's default model when the session names neither", settings: {}, read: { profile: null, warnings: [] } },
  {
    name: "launches a crew on llm.profile, with a warning, when agents.profile is not a profile name",
    settings: { "llm.profile": "large", "agents.profile": "a b" }, read: { profile: "large", warnings: [AGENTS_NOT_A_NAME_WARNING] },
  },
  {
    name: "warns of each key when neither is a profile name",
    settings: { "llm.profile": "a b", "agents.profile": "a b" }, read: { profile: null, warnings: [AGENTS_NOT_A_NAME_WARNING, NOT_A_NAME_WARNING] },
  },
];
