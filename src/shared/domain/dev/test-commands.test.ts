// Unit tests for the narrow test command rule. Run:
//   node --test src/shared/domain/dev/test-commands.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { checkValidation, validationLine } from "./test-commands.ts";
import {
  APPENDED, CLASS_RUN, INJECTIONS, INTEGRATION_RUN, INTEGRATION_WITH_CLASS, LINE_CASES, PACK, reason, SHELL_OPERATORS,
  TOO_LONG, WHOLE_RUNS,
} from "./test-commands.fixtures.ts";
import type { RefusalCase } from "./test-commands.fixtures.ts";

/** One test per refused command, named by the behaviour and the case. */
function refuses(behaviour: string, cases: readonly RefusalCase[]): void {
  for (const c of cases) {
    it(`${behaviour}: ${c.name}`, () => {
      // Arrange
      const { command, commands } = c;

      // Act
      const why = reason(command, commands);

      // Assert
      strictEqual(why, c.reason);
    });
  }
}

describe("checkValidation", () => {
  it("accepts a narrowed class run with its scope", () => {
    // Arrange
    const command = CLASS_RUN;

    // Act
    const check = checkValidation(command, PACK);

    // Assert
    deepStrictEqual(check, {
      ok: true,
      command: 'dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build --filter "FullyQualifiedName~AccountTests"',
      key: "commands.test_class",
      scope: "tests/A.Tests/A.Tests.csproj, AccountTests",
    });
  });

  it("accepts a project run as test_project", () => {
    // Arrange
    const command = "dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build";

    // Act
    const check = checkValidation(command, PACK);

    // Assert
    strictEqual(check.ok && check.key, "commands.test_project");
  });

  refuses("refuses the whole solution and the pack's own test and build commands", WHOLE_RUNS);

  it("refuses test_integration without a placeholder", () => {
    // Arrange
    const commands = { testIntegration: PACK.testIntegration };

    // Act
    const why = reason(PACK.testIntegration as string, commands);

    // Assert
    strictEqual(why, "test_integration without a filter is a whole suite");
  });

  it("accepts test_integration with its placeholder filled", () => {
    // Arrange
    const command = INTEGRATION_RUN;

    // Act
    const check = checkValidation(command, INTEGRATION_WITH_CLASS);

    // Assert
    deepStrictEqual(check.ok && [check.key, check.scope], ["commands.test_integration", "Orders.X"]);
  });

  refuses("refuses anything appended to the pack's command", APPENDED);
  refuses("refuses every injection the review found", INJECTIONS);
  refuses("refuses shell operators outside double quotes", SHELL_OPERATORS);
  refuses("refuses more than 400 characters and a second line", TOO_LONG);

  it("refuses everything for a pack without the keys", () => {
    // Arrange
    const commands = { test: "npm test" };

    // Act
    const why = reason("npm test", commands);

    // Assert
    strictEqual(why, "the pack has no test_class, test_project or test_integration");
  });

  it("names a template without placeholder as the pack names it", () => {
    // Arrange
    const commands = { testProject: "npm run test:unit" };

    // Act
    const check = checkValidation("npm run test:unit", commands);

    // Assert
    strictEqual(check.ok && check.scope, "as the pack names it");
  });
});

describe("validationLine", () => {
  for (const c of LINE_CASES) {
    it(`renders the counted and the uncounted forms: ${c.name}`, () => {
      // Arrange
      const { exit, count } = c;

      // Act
      const line = validationLine("npm run t", exit, "src/a", count);

      // Assert
      strictEqual(line, c.line);
    });
  }
});
