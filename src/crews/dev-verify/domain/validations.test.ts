// Unit tests for the validation command rule. Run:
//   node --test src/crews/dev-verify/domain/validations.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import { checkValidation, validationLine } from "./validations.ts";

const PACK: RepoPackCommands = {
  build: "dotnet build Orkeon.sln -c Release",
  test: "dotnet test Orkeon.sln -c Release --no-build",
  testClass: 'dotnet test <test project> -c Release --no-build --filter "FullyQualifiedName~<Class>"',
  testProject: "dotnet test <test project> -c Release --no-build",
  testIntegration: "dotnet test tests/Integration/Integration.csproj -c Release --no-build",
};

function reason(command: string, commands: RepoPackCommands = PACK): string {
  const check = checkValidation(command, commands);
  return check.ok ? "accepted" : check.reason;
}

describe("checkValidation", () => {
  it("accepts a narrowed class run with its scope", () => {
    deepStrictEqual(
      checkValidation('dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build --filter "FullyQualifiedName~AccountTests"', PACK),
      {
        ok: true,
        command: 'dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build --filter "FullyQualifiedName~AccountTests"',
        key: "commands.test_class",
        scope: "tests/A.Tests/A.Tests.csproj, AccountTests",
      });
  });

  it("accepts a project run as test_project", () => {
    const check = checkValidation("dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build", PACK);
    strictEqual(check.ok && check.key, "commands.test_project");
  });

  it("refuses the whole solution and the pack's own test and build commands", () => {
    strictEqual(reason("dotnet test Orkeon.sln -c Release --no-build", { testClass: PACK.testClass, test: PACK.test }),
      "not one of the pack's test_class, test_project or test_integration commands");
    strictEqual(reason("dotnet build Orkeon.sln -c Release"),
      "not one of the pack's test_class, test_project or test_integration commands");
  });

  it("refuses test_integration without a placeholder, accepts it filled", () => {
    strictEqual(reason(PACK.testIntegration as string, { testIntegration: PACK.testIntegration }),
      "test_integration without a filter is a whole suite");
    const integration = { testIntegration: 'dotnet test tests/Int.csproj --filter "Category=Integration&FullyQualifiedName~<Class>"' };
    const check = checkValidation('dotnet test tests/Int.csproj --filter "Category=Integration&FullyQualifiedName~Orders.X"', integration);
    deepStrictEqual(check.ok && [check.key, check.scope], ["commands.test_integration", "Orders.X"]);
  });

  it("refuses anything appended to the pack's command", () => {
    strictEqual(reason(`${PACK.testIntegration} --filter "Category=Integration"`, { testIntegration: PACK.testIntegration }),
      "nothing may follow the pack's command: '--filter \"Category=Integration\"'");
    strictEqual(reason("dotnet test tests/A.csproj -c Release --no-build extra", { testProject: PACK.testProject }),
      "nothing may follow the pack's command: 'extra'");
  });

  it("refuses every injection the review found", () => {
    const node = { testClass: "node --test --experimental-strip-types <file>" };
    strictEqual(reason(`node --test --experimental-strip-types src/a.test.ts --import "data:text/javascript,import('child_process').then(m=>m.execSync('touch /tmp/pwn'))"`, node),
      "nothing may follow the pack's command: '--import \"data:text/javascript,import('child_process').then(m=>m.execSync('touch /tmp/pwn'))\"'");
    strictEqual(reason("node --test --experimental-strip-types ../../../etc/passwd", node), "the value '../../../etc/passwd' holds a '..' segment");
    strictEqual(reason("node --test --experimental-strip-types src/../../x.ts", node), "the value 'src/../../x.ts' holds a '..' segment");
    strictEqual(reason("dotnet test tests/Int.csproj -c Release --no-build --test-adapter-path /tmp/evil", { testProject: PACK.testProject }),
      "nothing may follow the pack's command: '--test-adapter-path /tmp/evil'");
    strictEqual(reason("dotnet test /tmp/Evil.csproj -c Release --no-build", { testProject: PACK.testProject }),
      "the value '/tmp/Evil.csproj' is not one plain relative name");
    strictEqual(reason("dotnet test -v -c Release --no-build", { testProject: PACK.testProject }),
      "the value '-v' is not one plain relative name");
    strictEqual(reason("dotnet test ~/x.csproj -c Release --no-build", { testProject: PACK.testProject }),
      "the value '~/x.csproj' is not one plain relative name");
    strictEqual(reason("dotnet test tests/*.csproj -c Release --no-build", { testProject: PACK.testProject }),
      "the value 'tests/*.csproj' is not one plain relative name");
    strictEqual(reason('dotnet test x -c Release --no-build --filter "FullyQualifiedName~A B"', { testClass: PACK.testClass }),
      "not one of the pack's test_class, test_project or test_integration commands");
  });

  it("refuses shell operators outside double quotes", () => {
    strictEqual(reason("dotnet test tests/A.csproj -c Release --no-build; rm -rf x"), "a shell operator outside double quotes");
    strictEqual(reason("dotnet test tests/A.csproj -c Release --no-build && echo"), "a shell operator outside double quotes");
    strictEqual(reason("dotnet test $(pwd) -c Release --no-build"), "a shell operator outside double quotes");
    strictEqual(reason('dotnet test x -c Release --no-build --filter "a$b"'), "a shell operator outside double quotes");
    strictEqual(reason('dotnet test x -c Release --no-build --filter "open'), "a shell operator outside double quotes");
  });

  it("refuses more than 400 characters and a second line", () => {
    strictEqual(reason(`dotnet test ${"a".repeat(390)}`), "not one line of at most 400 characters");
    strictEqual(reason("dotnet test a\ndotnet test b"), "not one line of at most 400 characters");
  });

  it("refuses everything for a pack without the keys", () => {
    strictEqual(reason("npm test", { test: "npm test" }), "the pack has no test_class, test_project or test_integration");
  });

  it("names a template without placeholder as the pack names it", () => {
    const check = checkValidation("npm run test:unit", { testProject: "npm run test:unit" });
    strictEqual(check.ok && check.scope, "as the pack names it");
  });
});

describe("validationLine", () => {
  it("renders the counted and the uncounted forms", () => {
    strictEqual(validationLine("npm run t", 0, "src/a", 12), "`npm run t` — exit 0, scope src/a, 12 tests");
    strictEqual(validationLine("npm run t", 1, "src/a", null), "`npm run t` — exit 1, scope src/a, not counted tests");
  });
});
