// The two writing roles of a batch step: their tools and their prompts' reading and editing rules. Run:
//   node --test tests/crews/dev-implement/domain/roles.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { CREW_TOOLS, TEST_AUTHOR } from "../../../../src/crews/dev-implement/domain/roles.ts";
import { KNOWN_TOOLS_RULE, NODE_EDIT_RULE, NODE_READ_RULE } from "../../../../src/shared/domain/dev/reading-rule.ts";
import { toolsetFor } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { EXPECTED_CREW_TOOLS, NODE_EDIT_RULE_SAYS, NODE_TOOLS, ROLES, TEST_AUTHOR_STUB_SAYS } from "./roles.fixtures.ts";
import { assertHoldsTools, assertMentions } from "./roles.assertions.ts";

describe("the roles of a batch step", () => {
  for (const role of ROLES) {
    it(`hold the node readers and editors: the ${role.name}`, () => {
      // Arrange
      const expected = NODE_TOOLS;

      // Act
      const tools = role.tools;

      // Assert
      assertHoldsTools(tools, expected, role.name);
    });
  }

  it("hold the crew's tools, the readers then the writers", () => {
    // Arrange
    const expected = EXPECTED_CREW_TOOLS;

    // Act
    const tools = CREW_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("hold tools acceptEdits offers, all of them", () => {
    // Arrange
    const mode = "acceptEdits";

    // Act
    const offered = toolsetFor(mode);

    // Assert
    assertHoldsTools(offered, CREW_TOOLS, mode);
  });

  for (const role of ROLES) {
    it(`read and edit by node, file_write for a new file only: the ${role.name}`, () => {
      // Arrange
      const rules = [NODE_READ_RULE, NODE_EDIT_RULE];

      // Act
      const system = role.system;

      // Assert
      ok(system.includes(rules[0]) && system.includes(rules[1]), role.name);
      ok(system.includes(KNOWN_TOOLS_RULE), `${role.name}: the known-tools rule`);
    });
  }

  it("read a node by its outline, then node_read", () => {
    // Arrange
    const said = ["node_outline", "then node_read"];

    // Act
    const rule = NODE_READ_RULE;

    // Assert
    assertMentions(rule, said, "the node read rule");
  });

  it("edit a node by selector and hash, a batch whole, and create a file only with file_write", () => {
    // Arrange
    const said = NODE_EDIT_RULE_SAYS;

    // Act
    const rule = NODE_EDIT_RULE;

    // Assert
    assertMentions(rule, said, "the node edit rule");
  });

  it("let the test author write the signature stubs its brief allows, as the RED contract does", () => {
    // Arrange
    const said = TEST_AUTHOR_STUB_SAYS;

    // Act
    const system = TEST_AUTHOR.system;

    // Assert
    ok(!system.includes("no stub"), system);
    assertMentions(system, said, "the test author's system");
  });
});
