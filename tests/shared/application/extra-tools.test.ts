// The configured extra tools over a config store on FakeFiles, checked against
// FakeToolCatalogue. Run:
//   node --test src/shared/application/extra-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { configuredNames, readExtraTools, resolveExtraTools } from "../../../src/shared/application/extra-tools.ts";
import { FakeToolCatalogue } from "../../support/doubles/fake-tool-catalogue.ts";
import { MCP_NAMES, PROJECT_CONFIG, extraToolsHarness, failingConfig } from "./extra-tools.fixtures.ts";
import { WORKSPACE } from "../../../src/shared/domain/vfs.ts";

describe("readExtraTools", () => {
  it("reads the setting, saying which entries are invalid", async () => {
    // Arrange
    const { config } = extraToolsHarness("post bad:x");

    // Act
    const read = await readExtraTools(config);

    // Assert
    deepStrictEqual(read, { tools: [{ name: "post", access: "write" }], invalid: ["bad:x"] });
  });

  it("reads none when the setting is unset", async () => {
    // Arrange
    const { config } = extraToolsHarness();

    // Act
    const read = await readExtraTools(config);

    // Assert
    deepStrictEqual(read, { tools: [], invalid: [] });
  });

  it("reads none when the store fails, saying why", async () => {
    // Arrange
    const config = failingConfig();

    // Act
    const read = await readExtraTools(config);

    // Assert
    deepStrictEqual(read, { tools: [], invalid: [], unreadable: "no files tool" });
  });

  it("tells a settings file it cannot parse from an unset setting", async () => {
    // Arrange
    const { files, config } = extraToolsHarness();
    files.files.set(PROJECT_CONFIG, "{ not json");

    // Act
    const read = await readExtraTools(config);

    // Assert
    deepStrictEqual(read, {
      tools: [], invalid: [], unreadable: `${WORKSPACE}/.orkeon/config.json could not be read or parsed`,
    });
  });

  it("tells a settings file it cannot read from an unset setting", async () => {
    // Arrange
    const { files, config } = extraToolsHarness();
    files.readErrors.set(PROJECT_CONFIG, new Error("permission denied"));

    // Act
    const read = await readExtraTools(config);

    // Assert
    strictEqual(read.unreadable, `${WORKSPACE}/.orkeon/config.json could not be read or parsed`);
  });

  it("takes a session override as the setting, whatever the file holds", async () => {
    // Arrange
    const { files, config } = extraToolsHarness();
    files.readErrors.set(PROJECT_CONFIG, new Error("permission denied"));
    await config.writeSession({ "tools.extra": "post" });

    // Act
    const read = await readExtraTools(config);

    // Assert
    deepStrictEqual(read, { tools: [{ name: "post", access: "write" }], invalid: [] });
  });
});

describe("resolveExtraTools", () => {
  it("passes on why the setting could not be read", async () => {
    // Arrange
    const config = failingConfig();

    // Act
    const resolved = await resolveExtraTools({ config, catalogue: new FakeToolCatalogue() });

    // Assert
    deepStrictEqual(resolved, { present: [], missing: [], invalid: [], unreadable: "no files tool" });
  });

  it("splits the configured tools by whether the host registers them", async () => {
    // Arrange
    const { config, catalogue } = extraToolsHarness("transcribe_audio:read, gone, search_issues, oops:no");
    catalogue.tools.set("transcribe_audio", "");
    catalogue.tools.set("search_issues", "");

    // Act
    const resolved = await resolveExtraTools({ config, catalogue });

    // Assert
    deepStrictEqual(resolved, {
      present: [{ name: "transcribe_audio", access: "read" }, { name: "search_issues", access: "write" }],
      missing: [{ name: "gone", access: "write" }],
      invalid: ["oops:no"],
    });
  });

  it("names the configured tools, present then missing", async () => {
    // Arrange
    const { config, catalogue } = extraToolsHarness("transcribe_audio:read, gone, search_issues, oops:no");
    catalogue.tools.set("transcribe_audio", "");
    catalogue.tools.set("search_issues", "");
    const resolved = await resolveExtraTools({ config, catalogue });

    // Act
    const names = configuredNames(resolved);

    // Assert
    deepStrictEqual(names, ["transcribe_audio", "search_issues", "gone"]);
  });

  it("takes the names an MCP server registers, kebab-case, camelCase or snake_case, as registered", async () => {
    // Arrange
    const { config, catalogue } = extraToolsHarness("get-file-contents:read listIssues search_code");
    for (const name of MCP_NAMES) catalogue.tools.set(name, "");

    // Act
    const resolved = await resolveExtraTools({ config, catalogue });

    // Assert
    deepStrictEqual(resolved.present, [
      { name: "get-file-contents", access: "read" },
      { name: "listIssues", access: "write" },
      { name: "search_code", access: "write" },
    ]);
  });

  it("matches a name case-insensitively, as Orkeon does, and offers the registered spelling", async () => {
    // Arrange
    const { config, catalogue } = extraToolsHarness("Get-File-Contents:read LISTISSUES Search_Code");
    for (const name of MCP_NAMES) catalogue.tools.set(name, "");

    // Act
    const resolved = await resolveExtraTools({ config, catalogue });

    // Assert
    deepStrictEqual(resolved.present.map((t) => t.name), ["get-file-contents", "listIssues", "search_code"]);
  });

  it("does not take another spelling of a registered name for it: act would fail on it", async () => {
    // Arrange
    const { config, catalogue } = extraToolsHarness("get_file_contents list_issues search-code");
    for (const name of MCP_NAMES) catalogue.tools.set(name, "");

    // Act
    const resolved = await resolveExtraTools({ config, catalogue });

    // Assert
    deepStrictEqual(resolved.present, []);
    deepStrictEqual(resolved.missing.map((t) => t.name), ["get_file_contents", "list_issues", "search-code"]);
  });
});
