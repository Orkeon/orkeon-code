// The `tools.extra` notation: entries, classes, refusals. Run:
//   node --test src/shared/domain/agent-policy/extra-tools.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { extraToolsProblem, formatExtraTool, parseExtraTools } from "./extra-tools.ts";

describe("parseExtraTools", () => {
  it("reads entries separated by commas or spaces, a missing class being write", () => {
    deepStrictEqual(parseExtraTools(" transcribe_audio:read,search_issues  create-issue:write,, "), {
      tools: [
        { name: "transcribe_audio", access: "read" },
        { name: "search_issues", access: "write" },
        { name: "create-issue", access: "write" },
      ],
      invalid: [],
    });
  });

  it("refuses another class, a malformed name, a built-in tool and a name given again", () => {
    deepStrictEqual(parseExtraTools("a:exec b:Read :read c d!:read file_write:read shell_command c:read"), {
      tools: [{ name: "c", access: "write" }],
      invalid: ["a:exec", "b:Read", ":read", "d!:read", "file_write:read", "shell_command", "c:read"],
    });
  });

  it("compares names case-insensitively, as Orkeon does: another case is the same tool", () => {
    deepStrictEqual(parseExtraTools("File_Read SHELL_COMMAND search-issues Search-Issues:read"), {
      tools: [{ name: "search-issues", access: "write" }],
      invalid: ["File_Read", "SHELL_COMMAND", "Search-Issues:read"],
    });
  });

  it("reads the crew's list one entry per item, and nothing from a missing value", () => {
    deepStrictEqual(parseExtraTools(["post:write", "x y", 7]), {
      tools: [{ name: "post", access: "write" }, { name: "7", access: "write" }],
      invalid: ["x y"],
    });
    deepStrictEqual(parseExtraTools(undefined), { tools: [], invalid: [] });
  });
});

describe("formatExtraTool", () => {
  it("always writes the class, and reads back as written", () => {
    const tools = [{ name: "post", access: "write" as const }, { name: "fetch_doc", access: "read" as const }];
    deepStrictEqual(tools.map(formatExtraTool), ["post:write", "fetch_doc:read"]);
    deepStrictEqual(parseExtraTools(tools.map(formatExtraTool)).tools, tools);
  });
});

describe("extraToolsProblem", () => {
  it("accepts a valid value and names the refused entries of another", () => {
    strictEqual(extraToolsProblem("transcribe_audio:read search_issues"), undefined);
    strictEqual(extraToolsProblem("a b:exec"),
      "each entry is <name>[:read|:write], a tool that is not built in, named once; not: b:exec");
    strictEqual(extraToolsProblem(","), "it names no tool");
  });
});
