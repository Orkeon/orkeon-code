// The ToolCatalogue adapter: the registered names from a `tools` service served by a
// FakeServiceLocator, the calls through a tools namespace of plain functions, and
// the camelCase naming it reads that namespace with. Run:
//   node --test src/shared/infrastructure/orkeon/tool-catalogue.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createToolCalls, createToolCatalogue, toolMemberName } from "./tool-catalogue.ts";
import { FakeServiceLocator } from "../../../../tests/support/fake-script-host.ts";

describe("toolMemberName", () => {
  it("maps snake_case to the camelCase the tools namespace exposes", () => {
    strictEqual(toolMemberName("file_read"), "fileRead");
    strictEqual(toolMemberName("session_store"), "sessionStore");
    strictEqual(toolMemberName("index_codebase"), "indexCodebase");
  });

  it("leaves a single-word name alone", () => {
    strictEqual(toolMemberName("github"), "github");
  });

  it("handles a digit after the underscore", () => {
    strictEqual(toolMemberName("a_1b"), "a1b");
  });

  it("maps kebab-case and a capital first letter as the runtime does (an MCP server's names)", () => {
    strictEqual(toolMemberName("search-issues"), "searchIssues");
    strictEqual(toolMemberName("Transcribe_Audio"), "transcribeAudio");
    strictEqual(toolMemberName("_private_tool"), "privateTool");
    strictEqual(toolMemberName("get.file"), "get.file");
  });
});

describe("createToolCatalogue", () => {
  const calls: unknown[] = [];
  // The registered tools as the service hands them out: IBaseTool instances, read by `Name`.
  // Three MCP tools in three spellings, none of them the snake_case the namespace suggests.
  const registered = ["shell_command", "file_read", "index_status", "get-file-contents", "listIssues", "search_code"];
  const services = new FakeServiceLocator();
  services.services.set("tools", registered.map((Name) => ({ Name, Description: "" })));
  const tools = {
    shellCommand: async (input: unknown) => { calls.push(input); return { Stdout: "ok" }; },
    fileRead: async () => { throw new Error("tools.fileRead failed [path=/x]: not found"); },
    indexStatus: () => ({ roots: 1 }),
    getFileContents: (input: unknown) => ({ got: input }),
    listIssues: () => [],
    searchCode: () => [],
    version: "1.0",
  };
  const catalogue = createToolCatalogue(tools, services);

  it("names every registered tool as the host registers it, sorted", () => {
    deepStrictEqual(catalogue.names(), [
      "file_read", "get-file-contents", "index_status", "listIssues", "search_code", "shell_command",
    ]);
  });

  it("finds the registered name case-insensitively, as Orkeon matches tool names", () => {
    strictEqual(catalogue.find("shell_command"), "shell_command");
    strictEqual(catalogue.find("Shell_Command"), "shell_command");
    strictEqual(catalogue.find("get-file-contents"), "get-file-contents");
    strictEqual(catalogue.find("GET-FILE-CONTENTS"), "get-file-contents");
    strictEqual(catalogue.find("listissues"), "listIssues");
    strictEqual(catalogue.find("SEARCH_CODE"), "search_code");
  });

  it("does not take another spelling of a name for it: Orkeon would refuse it", () => {
    strictEqual(catalogue.find("get_file_contents"), undefined);
    strictEqual(catalogue.find("getFileContents"), undefined);
    strictEqual(catalogue.find("list_issues"), undefined);
    strictEqual(catalogue.find("search-code"), undefined);
    strictEqual(catalogue.find("shell-command"), undefined);
    strictEqual(catalogue.find("version"), undefined);
    strictEqual(catalogue.find("web_scrape"), undefined);
  });

  it("calls a tool through its namespace member, with the arguments as given, and resolves to its raw result", async () => {
    deepStrictEqual(await catalogue.call("shell_command", { command: "ls" }), { Stdout: "ok" });
    deepStrictEqual(calls, [{ command: "ls" }]);
    deepStrictEqual(await catalogue.call("index_status", {}), { roots: 1 });
    deepStrictEqual(await catalogue.call("Get-File-Contents", { path: "a" }), { got: { path: "a" } });
  });

  it("refuses a name no registered tool answers to", async () => {
    await rejects(catalogue.call("get_file_contents", {}), /no registered tool 'get_file_contents'/);
  });

  it("lets a failing tool throw its own message", async () => {
    await rejects(catalogue.call("file_read", { path: "/x" }), /tools\.fileRead failed \[path=\/x\]: not found/);
  });

  it("reads no name from a service that hands out nothing", () => {
    const empty = new FakeServiceLocator();
    strictEqual(createToolCatalogue(tools, empty).find("shell_command"), undefined);
    deepStrictEqual(createToolCatalogue(tools, empty).names(), []);
  });
});

describe("createToolCalls — a crew's calls, by registered name", () => {
  it("calls the camelCase member of the name and passes the result through", async () => {
    const received: unknown[] = [];
    const calls = createToolCalls({ transcribeAudio: async (input: unknown) => { received.push(input); return "Bonjour."; } });
    strictEqual(await calls.call("transcribe_audio", { path: "/audio/a.m4a" }), "Bonjour.");
    deepStrictEqual(received, [{ path: "/audio/a.m4a" }]);
  });

  it("throws for a name the namespace does not expose, and passes a failure on", async () => {
    await rejects(createToolCalls({}).call("transcribe_audio", {}), /no registered tool 'transcribe_audio'/);
    const failing = createToolCalls({ listAudio: async () => { throw new Error("server gone"); } });
    await rejects(failing.call("list_audio", {}), /server gone/);
  });
});
