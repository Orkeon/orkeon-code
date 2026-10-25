// The two writing roles of a batch step: their tools and their prompts' reading and editing rules. Run:
//   node --test src/crews/dev-implement/domain/roles.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { CREW_TOOLS, IMPLEMENTER, TEST_AUTHOR } from "./roles.ts";
import { KNOWN_TOOLS_RULE, NODE_EDIT_RULE, NODE_READ_RULE } from "../../../shared/domain/dev/reading-rule.ts";
import { toolsetFor } from "../../../shared/domain/agent-policy/permission.ts";

const NODE_TOOLS = ["node_outline", "node_read", "node_replace", "node_insert", "node_ensure", "edit_batch"];

describe("the roles of a batch step", () => {
  it("hold the node readers and editors, all of them tools acceptEdits offers", () => {
    for (const role of [TEST_AUTHOR, IMPLEMENTER]) {
      for (const tool of NODE_TOOLS) ok(role.tools.includes(tool), `${role.name}: ${tool}`);
    }
    deepStrictEqual(CREW_TOOLS, [
      "file_read", "node_outline", "node_read", "glob", "grep",
      "file_write", "edit_file", "node_replace", "node_insert", "node_ensure", "edit_batch",
    ]);
    const offered = toolsetFor("acceptEdits");
    for (const tool of CREW_TOOLS) ok(offered.includes(tool), tool);
  });

  it("read and edit by node, file_write for a new file only", () => {
    for (const role of [TEST_AUTHOR, IMPLEMENTER]) {
      ok(role.system.includes(NODE_READ_RULE) && role.system.includes(NODE_EDIT_RULE), role.name);
      ok(role.system.includes(KNOWN_TOOLS_RULE), `${role.name}: the known-tools rule`);
    }
    ok(NODE_READ_RULE.includes("node_outline") && NODE_READ_RULE.includes("then node_read"));
    ok(NODE_EDIT_RULE.includes("node_replace with the selector and the sha256 node_read gave"));
    ok(NODE_EDIT_RULE.includes("one edit_batch (validate \"parse\"): all of it applies or none"));
    ok(NODE_EDIT_RULE.includes("file_write only creates a new file"));
  });

  it("let the test author write the signature stubs its brief allows, as the RED contract does", () => {
    ok(!TEST_AUTHOR.system.includes("no stub"), TEST_AUTHOR.system);
    ok(TEST_AUTHOR.system.includes("signature stubs the brief allows"), TEST_AUTHOR.system);
    ok(TEST_AUTHOR.system.includes("no production line"), TEST_AUTHOR.system);
  });
});
