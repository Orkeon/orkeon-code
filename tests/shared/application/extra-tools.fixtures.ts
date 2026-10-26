// A config store on FakeFiles and a tool catalogue, for the extra-tools tests.
import { USER_CONFIG_FILE_PATH, createConfigStore } from "../../../src/shared/application/config-store.ts";
import { FakeFiles } from "../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../support/doubles/fake-session-store.ts";
import { FakeToolCatalogue } from "../../support/doubles/fake-tool-catalogue.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

export const PROJECT_CONFIG = `${WORKSPACE}/.orkeon/config.json`;

/** Files holding `setting` as the user's `tools.extra` (nothing when undefined), their config store, an empty catalogue. */
export function extraToolsHarness(setting?: string) {
  const files = new FakeFiles();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  if (setting !== undefined) files.files.set(USER_CONFIG_FILE_PATH, JSON.stringify({ "tools.extra": setting }));
  return { files, config, catalogue: new FakeToolCatalogue() };
}

/** A config store whose every read throws "no files tool". */
export function failingConfig() {
  return { ...extraToolsHarness().config, readValue: async () => { throw new Error("no files tool"); } };
}

/** The names an MCP server registers: kebab-case, camelCase, snake_case. */
export const MCP_NAMES: readonly string[] = ["get-file-contents", "listIssues", "search_code"];
