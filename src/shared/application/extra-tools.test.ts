// The configured extra tools over a config store on FakeFiles, checked against
// FakeToolCatalogue. Run:
//   node --test src/shared/application/extra-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { configuredNames, readExtraTools, resolveExtraTools } from "./extra-tools.ts";
import { createConfigStore } from "./config-store.ts";
import { FakeFiles } from "../../../tests/support/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/fake-session-store.ts";
import { FakeToolCatalogue } from "../../../tests/support/fake-tool-catalogue.ts";

function setup(setting?: string) {
  const files = new FakeFiles();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  if (setting !== undefined) files.files.set("/workspace/.orkeon/config.json", JSON.stringify({ "tools.extra": setting }));
  return { files, config, catalogue: new FakeToolCatalogue() };
}

describe("readExtraTools", () => {
  it("reads the setting, and none when it is unset or the store fails, saying why", async () => {
    deepStrictEqual(await readExtraTools(setup("post bad:x").config), {
      tools: [{ name: "post", access: "write" }], invalid: ["bad:x"],
    });
    deepStrictEqual(await readExtraTools(setup().config), { tools: [], invalid: [] });
    const failing = { ...setup().config, readValue: async () => { throw new Error("no files tool"); } };
    deepStrictEqual(await readExtraTools(failing), { tools: [], invalid: [], unreadable: "no files tool" });
  });

  it("tells a settings file it cannot read or parse from an unset setting", async () => {
    const { files, config } = setup();
    files.files.set("/workspace/.orkeon/config.json", "{ not json");
    deepStrictEqual(await readExtraTools(config), {
      tools: [], invalid: [], unreadable: "/workspace/.orkeon/config.json could not be read or parsed",
    });
    files.files.delete("/workspace/.orkeon/config.json");
    files.readErrors.set("/workspace/.orkeon/config.json", new Error("permission denied"));
    strictEqual((await readExtraTools(config)).unreadable, "/workspace/.orkeon/config.json could not be read or parsed");
    // A session override is the setting, whatever the file holds.
    await config.writeSession({ "tools.extra": "post" });
    deepStrictEqual(await readExtraTools(config), { tools: [{ name: "post", access: "write" }], invalid: [] });
  });
});

describe("resolveExtraTools", () => {
  it("passes on why the setting could not be read", async () => {
    const failing = { ...setup().config, readValue: async () => { throw new Error("no files tool"); } };
    deepStrictEqual(await resolveExtraTools({ config: failing, catalogue: new FakeToolCatalogue() }), {
      present: [], missing: [], invalid: [], unreadable: "no files tool",
    });
  });

  it("splits the configured tools by whether the host registers them", async () => {
    const { config, catalogue } = setup("transcribe_audio:read, gone, search_issues, oops:no");
    catalogue.tools.set("transcribe_audio", "");
    catalogue.tools.set("search_issues", "");
    const resolved = await resolveExtraTools({ config, catalogue });
    deepStrictEqual(resolved, {
      present: [{ name: "transcribe_audio", access: "read" }, { name: "search_issues", access: "write" }],
      missing: [{ name: "gone", access: "write" }],
      invalid: ["oops:no"],
    });
    deepStrictEqual(configuredNames(resolved), ["transcribe_audio", "search_issues", "gone"]);
  });

  it("takes the names an MCP server registers, kebab-case, camelCase or snake_case, as registered", async () => {
    const { config, catalogue } = setup("get-file-contents:read listIssues search_code");
    for (const name of ["get-file-contents", "listIssues", "search_code"]) catalogue.tools.set(name, "");
    deepStrictEqual((await resolveExtraTools({ config, catalogue })).present, [
      { name: "get-file-contents", access: "read" },
      { name: "listIssues", access: "write" },
      { name: "search_code", access: "write" },
    ]);
  });

  it("matches a name case-insensitively, as Orkeon does, and offers the registered spelling", async () => {
    const { config, catalogue } = setup("Get-File-Contents:read LISTISSUES Search_Code");
    for (const name of ["get-file-contents", "listIssues", "search_code"]) catalogue.tools.set(name, "");
    deepStrictEqual((await resolveExtraTools({ config, catalogue })).present.map((t) => t.name), [
      "get-file-contents", "listIssues", "search_code",
    ]);
  });

  it("does not take another spelling of a registered name for it: act would fail on it", async () => {
    const { config, catalogue } = setup("get_file_contents list_issues search-code");
    for (const name of ["get-file-contents", "listIssues", "search_code"]) catalogue.tools.set(name, "");
    const resolved = await resolveExtraTools({ config, catalogue });
    deepStrictEqual(resolved.present, []);
    deepStrictEqual(resolved.missing.map((t) => t.name), ["get_file_contents", "list_issues", "search-code"]);
  });
});
