// Test sources the shape check is run on, the cases of the clock, doubles, src/ and module rules, and the reader of
// the repository the rules are run over.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { classMethods, portNames } from "./syntax.ts";
import { CLOCK_RULE, DOUBLES_RULE, MODULE_RULE, SRC_RULE } from "./test-shape.ts";

const ROOT = posix.join(posix.dirname(fileURLToPath(import.meta.url)), "../..");
const PORTS_DIR = "src/shared/application/ports";
const DOUBLES = "tests/support/doubles";

/** Every .ts file under `dir` (no declaration), by repository path, in sorted order. */
export function filesUnder(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(posix.join(ROOT, dir)).sort()) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const rel = posix.join(dir, e);
    if (statSync(posix.join(ROOT, rel)).isDirectory()) filesUnder(rel, acc);
    else if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) acc.push(rel);
  }
  return acc;
}

export const readRepo = (file: string) => readFileSync(posix.join(ROOT, file), "utf-8");

/** The ports of src/shared/application/ports/, read from the exports of its files (ports.ts re-exports them). */
export const repositoryPorts = () =>
  new Set(filesUnder(PORTS_DIR).flatMap((file) => [...portNames(file, readRepo(file))]));

/** The methods of every double of tests/support/doubles/, by class name. */
export function repositoryDoubleMethods(): Map<string, Set<string>> {
  return new Map(filesUnder(DOUBLES).flatMap((file) => [...classMethods(file, readRepo(file))]));
}

/** A test laid out Arrange, Act, Assert. */
export const AAA_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;

  // Act
  const sum = add(a, 2);

  // Assert
  strictEqual(sum, 3);
});
`;

/** A test that calls and checks on one line, with no section. */
export const BARE_TEST = `
it("adds", () => {
  strictEqual(add(1, 2), 3);
});
`;

/** A test that acts twice. */
export const TWO_ACTS_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;
  // Act
  const one = add(a, 2);
  // Assert
  strictEqual(one, 3);
  // Act
  const two = add(a, 3);
  // Assert
  strictEqual(two, 4);
});
`;

/** A test whose Assert comes before its Act. */
export const OUT_OF_ORDER_TEST = `
it("adds", () => {
  // Arrange
  const a = 1;
  // Assert
  // Act
  strictEqual(add(a, 2), 3);
});
`;

/** Tests built in a loop over a table, the second one bare, inside a describe; and an async test(). */
export const LOOP_TESTS = `
describe("add", () => {
  for (const c of CASES) {
    it(\`adds \${c.name}\`, () => {
      // Arrange
      const { a, b } = c;
      // Act
      const sum = add(a, b);
      // Assert
      strictEqual(sum, c.sum);
    });
  }
  test("adds zero", async () => {
    strictEqual(add(0, 0), 0);
  });
});
`;

/** Calls that declare no test: a todo, a describe, a helper named like a test with no body. */
export const NOT_TESTS = `
it.todo("later");
describe("add", () => {});
it("named only");
`;

/** A file of test code, or not, and the clock problems found in it. */
export const CLOCK_CASES: ReadonlyArray<{ name: string; file: string; text: string; problems: string[] }> = [
  {
    name: "refuses new Date() to a test",
    file: "tests/crews/x/plan.test.ts",
    text: "const now = new Date();",
    problems: [`tests/crews/x/plan.test.ts:1: new Date(): ${CLOCK_RULE}`],
  },
  {
    name: "refuses a timer to fixtures",
    file: "tests/crews/x/plan.fixtures.ts",
    text: "export const later = () => new Promise((r) => setTimeout(r, 5));",
    problems: [`tests/crews/x/plan.fixtures.ts:1: setTimeout(): ${CLOCK_RULE}`],
  },
  {
    name: "refuses Date.now() to a double of tests/support/",
    file: "tests/support/doubles/fake-progress.ts",
    text: "const at = Date.now();",
    problems: [`tests/support/doubles/fake-progress.ts:1: Date.now(): ${CLOCK_RULE}`],
  },
  {
    name: "lets a test of tests/scripts/ wait on a real process",
    file: "tests/scripts/launcher.test.ts",
    text: "await new Promise((r) => setTimeout(r, 50));",
    problems: [],
  },
  {
    name: "lets a test build a date from a value",
    file: "tests/crews/x/plan.test.ts",
    text: "const at = new Date(Date.parse(\"2026-10-24T10:00:00Z\"));",
    problems: [],
  },
  {
    name: "leaves runtime code to the architecture rule",
    file: "src/shared/infrastructure/orkeon/wiring.ts",
    text: "export const orkeonClock = () => new Date();",
    problems: [],
  },
];

export const PORTS: ReadonlySet<string> = new Set(["Shell", "HumanInput"]);
export const METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map([["FakeFiles", new Set(["read", "write"])]]);

/** A file, and the doubles problems found in it. */
export const DOUBLE_CASES: ReadonlyArray<{ name: string; file: string; text: string; problems: string[] }> = [
  {
    name: "refuses a class deriving a fake to fixtures",
    file: "tests/crews/x/plan.fixtures.ts",
    text: "export class SpyFiles extends FakeFiles {}",
    problems: [`tests/crews/x/plan.fixtures.ts:1: class SpyFiles extends FakeFiles: ${DOUBLES_RULE}`],
  },
  {
    name: "refuses a method of a fake replaced in a test",
    file: "tests/crews/x/plan.test.ts",
    text: "const files = new FakeFiles();\nfiles.write = async () => { throw new Error(\"full\"); };",
    problems: [`tests/crews/x/plan.test.ts:2: FakeFiles.write replaced on an instance: ${DOUBLES_RULE}`],
  },
  {
    name: "refuses a port implemented by an object literal in fixtures",
    file: "tests/crews/x/plan.fixtures.ts",
    text: "export const human: HumanInput = { choice: async () => ({ answered: false }) };",
    problems: [`tests/crews/x/plan.fixtures.ts:1: an object literal implements HumanInput: ${DOUBLES_RULE}`],
  },
  {
    name: "refuses a port implemented by a class in a test of tests/",
    file: "tests/scripts/dev-run.test.ts",
    text: "class LocalShell implements Shell { async run() { return RESULT; } }",
    problems: [`tests/scripts/dev-run.test.ts:1: class LocalShell implements Shell: ${DOUBLES_RULE}`],
  },
  {
    name: "lets tests/support/doubles/ implement a port and derive a fake",
    file: "tests/support/doubles/fake-shell.ts",
    text: "export class FakeShell implements Shell {}\nexport class FakeJobShell extends FakeShell {}",
    problems: [],
  },
  {
    name: "lets an adapter of src/ implement its port",
    file: "src/shared/infrastructure/orkeon/shell.ts",
    text: "export const orkeonShell = (): Shell => ({ run: async () => RESULT });",
    problems: [],
  },
];

/** A file under src/ or not, and the problem the src/ rule finds: no test, fixtures nor assertions file in src/. */
export const SRC_CASES: ReadonlyArray<{ name: string; file: string; problem: string | null }> = [
  { name: "refuses a test under src/", file: "src/crews/x/domain/plan.test.ts", problem: `src/crews/x/domain/plan.test.ts: ${SRC_RULE}` },
  { name: "refuses fixtures under src/", file: "src/crews/x/plan.fixtures.ts", problem: `src/crews/x/plan.fixtures.ts: ${SRC_RULE}` },
  {
    name: "refuses the assertions of a facet under src/",
    file: "src/shared/application/run.decide.assertions.ts",
    problem: `src/shared/application/run.decide.assertions.ts: ${SRC_RULE}`,
  },
  { name: "passes a runtime module of src/", file: "src/crews/x/domain/plan.ts", problem: null },
  { name: "passes a runtime module of src/ whose name speaks of tests", file: "src/crews/x/domain/test-plan.ts", problem: null },
  { name: "passes a test of the mirror", file: "tests/crews/x/domain/plan.test.ts", problem: null },
];

/** A file of tests/, the files of the repository, and the module problem found. */
export const MODULE_CASES: ReadonlyArray<{ name: string; file: string; files: string[]; problem: string | null }> = [
  { name: "passes a test of the mirror whose module is in src/", file: "tests/crews/x/plan.test.ts", files: ["src/crews/x/plan.ts"], problem: null },
  {
    name: "passes a facet test of the mirror whose module is in src/",
    file: "tests/shared/x/plan.interop.test.ts",
    files: ["src/shared/x/plan.ts"],
    problem: null,
  },
  {
    name: "passes the fixtures of a module of commands/",
    file: "tests/commands/_lib/git/commit.fixtures.ts",
    files: ["src/commands/_lib/git/commit.ts"],
    problem: null,
  },
  {
    name: "passes the assertions of a facet whose module is in src/",
    file: "tests/crews/x/plan.interop.assertions.ts",
    files: ["src/crews/x/plan.ts"],
    problem: null,
  },
  {
    name: "refuses a test whose module sits in another folder",
    file: "tests/crews/x/plan.test.ts",
    files: ["src/crews/y/plan.ts"],
    problem: `tests/crews/x/plan.test.ts: ${MODULE_RULE}`,
  },
  {
    name: "refuses a test whose module sits beside it under tests/, not in src/",
    file: "tests/crews/x/plan.test.ts",
    files: ["tests/crews/x/plan.ts"],
    problem: `tests/crews/x/plan.test.ts: ${MODULE_RULE}`,
  },
  {
    name: "refuses a second test file named with a dash rather than a facet",
    file: "tests/crews/x/plan-interop.test.ts",
    files: ["src/crews/x/plan.ts"],
    problem: `tests/crews/x/plan-interop.test.ts: ${MODULE_RULE}`,
  },
  {
    name: "refuses fixtures whose module is not in src/",
    file: "tests/shared/x/render.fixtures.ts",
    files: ["src/shared/x/plan.ts"],
    problem: `tests/shared/x/render.fixtures.ts: ${MODULE_RULE}`,
  },
  { name: "leaves a test of tests/repository/ to its subject", file: "tests/repository/version.test.ts", files: [], problem: null },
  { name: "leaves a test of tests/scripts/ to its subject", file: "tests/scripts/launcher.test.ts", files: [], problem: null },
  { name: "leaves a double of tests/support/ alone", file: "tests/support/doubles/fake-shell.ts", files: [], problem: null },
];
