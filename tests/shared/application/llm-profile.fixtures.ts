// A config store on FakeFiles for readLlmProfile: the user settings file holding `llm.profile`, or none.
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
