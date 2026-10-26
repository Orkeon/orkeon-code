// The pack and the commands the narrow test command rule is tested on.
import type { RepoPackCommands } from "../../../../src/shared/domain/dev/repo-pack.ts";
import { checkValidation } from "../../../../src/shared/domain/dev/test-commands.ts";

export const PACK: RepoPackCommands = {
  build: "dotnet build Orkeon.sln -c Release",
  test: "dotnet test Orkeon.sln -c Release --no-build",
  testClass: 'dotnet test <test project> -c Release --no-build --filter "FullyQualifiedName~<Class>"',
  testProject: "dotnet test <test project> -c Release --no-build",
  testIntegration: "dotnet test tests/Integration/Integration.csproj -c Release --no-build",
};

/** Why checkValidation refuses `command`, or "accepted". */
export function reason(command: string, commands: RepoPackCommands = PACK): string {
  const check = checkValidation(command, commands);
  return check.ok ? "accepted" : check.reason;
}

/** A class run narrowed to one project and one class. */
export const CLASS_RUN = 'dotnet test tests/A.Tests/A.Tests.csproj -c Release --no-build --filter "FullyQualifiedName~AccountTests"';

/** An integration template with a class placeholder, and a run filling it. */
export const INTEGRATION_WITH_CLASS: RepoPackCommands = {
  testIntegration: 'dotnet test tests/Int.csproj --filter "Category=Integration&FullyQualifiedName~<Class>"',
};
export const INTEGRATION_RUN = 'dotnet test tests/Int.csproj --filter "Category=Integration&FullyQualifiedName~Orders.X"';

export interface RefusalCase {
  name: string;
  command: string;
  /** The pack commands; PACK when absent. */
  commands?: RepoPackCommands;
  reason: string;
}

const NOT_NARROW = "not one of the pack's test_class, test_project or test_integration commands";

export const WHOLE_RUNS: readonly RefusalCase[] = [
  {
    name: "the whole solution", command: "dotnet test Orkeon.sln -c Release --no-build",
    commands: { testClass: PACK.testClass, test: PACK.test }, reason: NOT_NARROW,
  },
  { name: "the pack's build", command: "dotnet build Orkeon.sln -c Release", reason: NOT_NARROW },
];

export const APPENDED: readonly RefusalCase[] = [
  {
    name: "a filter after test_integration", command: `${PACK.testIntegration} --filter "Category=Integration"`,
    commands: { testIntegration: PACK.testIntegration }, reason: "nothing may follow the pack's command: '--filter \"Category=Integration\"'",
  },
  {
    name: "a word after test_project", command: "dotnet test tests/A.csproj -c Release --no-build extra",
    commands: { testProject: PACK.testProject }, reason: "nothing may follow the pack's command: 'extra'",
  },
];

const NODE: RepoPackCommands = { testClass: "node --test --experimental-strip-types <file>" };
const PROJECT_ONLY: RepoPackCommands = { testProject: PACK.testProject };

/** Every injection the review found. */
export const INJECTIONS: readonly RefusalCase[] = [
  {
    name: "an --import of a data URL after the file",
    command: `node --test --experimental-strip-types src/a.test.ts --import "data:text/javascript,import('child_process').then(m=>m.execSync('touch /tmp/pwn'))"`,
    commands: NODE,
    reason: "nothing may follow the pack's command: '--import \"data:text/javascript,import('child_process').then(m=>m.execSync('touch /tmp/pwn'))\"'",
  },
  {
    name: "a file climbing out", command: "node --test --experimental-strip-types ../../../etc/passwd", commands: NODE,
    reason: "the value '../../../etc/passwd' holds a '..' segment",
  },
  {
    name: "a file climbing out through a folder", command: "node --test --experimental-strip-types src/../../x.ts", commands: NODE,
    reason: "the value 'src/../../x.ts' holds a '..' segment",
  },
  {
    name: "a test adapter path appended",
    command: "dotnet test tests/Int.csproj -c Release --no-build --test-adapter-path /tmp/evil", commands: PROJECT_ONLY,
    reason: "nothing may follow the pack's command: '--test-adapter-path /tmp/evil'",
  },
  {
    name: "an absolute project", command: "dotnet test /tmp/Evil.csproj -c Release --no-build", commands: PROJECT_ONLY,
    reason: "the value '/tmp/Evil.csproj' is not one plain relative name",
  },
  {
    name: "an option for a project", command: "dotnet test -v -c Release --no-build", commands: PROJECT_ONLY,
    reason: "the value '-v' is not one plain relative name",
  },
  {
    name: "a project under the home folder", command: "dotnet test ~/x.csproj -c Release --no-build", commands: PROJECT_ONLY,
    reason: "the value '~/x.csproj' is not one plain relative name",
  },
  {
    name: "a glob for a project", command: "dotnet test tests/*.csproj -c Release --no-build", commands: PROJECT_ONLY,
    reason: "the value 'tests/*.csproj' is not one plain relative name",
  },
  {
    name: "a class with a space", command: 'dotnet test x -c Release --no-build --filter "FullyQualifiedName~A B"',
    commands: { testClass: PACK.testClass }, reason: NOT_NARROW,
  },
];

const OPERATOR = "a shell operator outside double quotes";

export const SHELL_OPERATORS: readonly RefusalCase[] = [
  { name: "a semicolon", command: "dotnet test tests/A.csproj -c Release --no-build; rm -rf x", reason: OPERATOR },
  { name: "an &&", command: "dotnet test tests/A.csproj -c Release --no-build && echo", reason: OPERATOR },
  { name: "a command substitution", command: "dotnet test $(pwd) -c Release --no-build", reason: OPERATOR },
  { name: "a $ inside double quotes", command: 'dotnet test x -c Release --no-build --filter "a$b"', reason: OPERATOR },
  { name: "an unclosed double quote", command: 'dotnet test x -c Release --no-build --filter "open', reason: OPERATOR },
];

const ONE_LINE = "not one line of at most 400 characters";

export const TOO_LONG: readonly RefusalCase[] = [
  { name: "more than 400 characters", command: `dotnet test ${"a".repeat(390)}`, reason: ONE_LINE },
  { name: "a second line", command: "dotnet test a\ndotnet test b", reason: ONE_LINE },
];

export interface LineCase {
  name: string;
  exit: number;
  count: number | null;
  line: string;
}

export const LINE_CASES: readonly LineCase[] = [
  { name: "counted", exit: 0, count: 12, line: "`npm run t` — exit 0, scope src/a, 12 tests" },
  { name: "uncounted", exit: 1, count: null, line: "`npm run t` — exit 1, scope src/a, not counted tests" },
];
