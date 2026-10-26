// The registered tools, the tools namespace and the names the ToolCatalogue tests read.
import { createToolCatalogue } from "../../../../src/shared/infrastructure/orkeon/tool-catalogue.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";

export interface NameCase {
  name: string;
  input: string;
  expected: string;
}

/** Tool names and the namespace member each maps to, as the runtime maps them. */
export const MEMBER_NAMES: readonly NameCase[] = [
  { name: "maps snake_case file_read to the camelCase the tools namespace exposes", input: "file_read", expected: "fileRead" },
  { name: "maps snake_case session_store to the camelCase the tools namespace exposes", input: "session_store", expected: "sessionStore" },
  { name: "maps snake_case index_codebase to the camelCase the tools namespace exposes", input: "index_codebase", expected: "indexCodebase" },
  { name: "leaves a single-word name alone", input: "github", expected: "github" },
  { name: "handles a digit after the underscore", input: "a_1b", expected: "a1b" },
  { name: "maps kebab-case as the runtime does (an MCP server's names)", input: "search-issues", expected: "searchIssues" },
  { name: "maps a capital first letter as the runtime does (an MCP server's names)", input: "Transcribe_Audio", expected: "transcribeAudio" },
  { name: "drops a leading underscore as the runtime does", input: "_private_tool", expected: "privateTool" },
  { name: "leaves a dotted name alone, as the runtime does", input: "get.file", expected: "get.file" },
];

/** The tools namespace of plain functions, and the inputs shell_command received. */
export function toolsNamespace() {
  const calls: unknown[] = [];
  const tools = {
    shellCommand: async (input: unknown) => { calls.push(input); return { Stdout: "ok" }; },
    fileRead: async () => { throw new Error("tools.fileRead failed [path=/x]: not found"); },
    indexStatus: () => ({ roots: 1 }),
    getFileContents: (input: unknown) => ({ got: input }),
    listIssues: () => [],
    searchCode: () => [],
    version: "1.0",
  };
  return { tools, calls };
}

/**
 * A catalogue over the registered tools as the service hands them out: IBaseTool instances, read by `Name`. Three MCP
 * tools in three spellings, none of them the snake_case the namespace suggests.
 */
export function catalogueOverFake() {
  const registered = ["shell_command", "file_read", "index_status", "get-file-contents", "listIssues", "search_code"];
  const services = new FakeServiceLocator();
  services.services.set("tools", registered.map((Name) => ({ Name, Description: "" })));
  const { tools, calls } = toolsNamespace();
  return { catalogue: createToolCatalogue(tools, services), calls };
}

/** Spellings of registered names the catalogue finds case-insensitively, as Orkeon matches tool names. */
export const FOUND_NAMES: readonly NameCase[] = [
  { name: "finds shell_command as it is registered", input: "shell_command", expected: "shell_command" },
  { name: "finds shell_command case-insensitively", input: "Shell_Command", expected: "shell_command" },
  { name: "finds get-file-contents as it is registered", input: "get-file-contents", expected: "get-file-contents" },
  { name: "finds get-file-contents case-insensitively", input: "GET-FILE-CONTENTS", expected: "get-file-contents" },
  { name: "finds listIssues case-insensitively", input: "listissues", expected: "listIssues" },
  { name: "finds search_code case-insensitively", input: "SEARCH_CODE", expected: "search_code" },
];

/** Other spellings of a name, a namespace member that is no tool, and an unregistered tool: Orkeon would refuse them. */
export const UNFOUND_NAMES: readonly string[] = [
  "get_file_contents", "getFileContents", "list_issues", "search-code", "shell-command", "version", "web_scrape",
];

export interface CallCase {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  expected: unknown;
}

/** Calls through a namespace member, resolving to the tool's raw result. */
export const RAW_CALLS: readonly CallCase[] = [
  { name: "resolves a synchronous tool to its raw result", tool: "index_status", args: {}, expected: { roots: 1 } },
  {
    name: "calls a tool by another casing of its registered name, with the arguments as given",
    tool: "Get-File-Contents",
    args: { path: "a" },
    expected: { got: { path: "a" } },
  },
];
