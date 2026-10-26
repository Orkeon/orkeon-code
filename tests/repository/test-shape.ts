// The shape every test keeps (CONTRIBUTING.md, "Tests"): its body is laid out Arrange, Act, Assert, each section
// opened by its own comment line, once, in that order. Read from the syntax tree, so a test built in a loop over a
// fixture table is checked like any other. Test code besides reads no clock and starts no timer (tests/scripts/
// aside), derives no double outside tests/support/doubles/, and a test of src/ sits beside its module. Pure: the
// caller hands the source text and the files.
import ts from "typescript";
import { clockReads, derivedDoubles } from "./syntax.ts";

const SECTIONS = ["Arrange", "Act", "Assert"] as const;
const TEST_CALLS = new Set(["it", "test"]);

/** The name of the test a call declares, or null when the call declares none (`it.todo`, a call without a body). */
function testName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  const base = ts.isPropertyAccessExpression(callee) ? callee.expression : callee;
  if (!ts.isIdentifier(base) || !TEST_CALLS.has(base.text)) return null;
  if (ts.isPropertyAccessExpression(callee) && !["only", "skip"].includes(callee.name.text)) return null;
  const first = call.arguments[0];
  if (first === undefined) return null;
  return ts.isStringLiteralLike(first) || ts.isTemplateExpression(first) ? first.getText().slice(1, -1) : first.getText();
}

/** The body of the function a test call hands over, or null. */
function bodyOf(call: ts.CallExpression): ts.Node | null {
  const fn = [...call.arguments].reverse().find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
  return fn === undefined ? null : (fn as ts.ArrowFunction | ts.FunctionExpression).body;
}

/** What is wrong with the shape of one test body; null when it keeps it. */
export function sectionProblem(body: string): string | null {
  const lines = body.split(/\r?\n/u).map((l) => l.trim());
  const at: number[] = [];
  for (const section of SECTIONS) {
    const found = lines.flatMap((l, i) => (l === `// ${section}` ? [i] : []));
    if (found.length === 0) return `no "// ${section}" line`;
    if (found.length > 1) return `"// ${section}" ${found.length} times: one act per test`;
    at.push(found[0]);
  }
  return at[0] < at[1] && at[1] < at[2] ? null : "the sections are not in the order Arrange, Act, Assert";
}

/** Every test of `text` that breaks the shape, as `<file>:<line>: <test name>: <problem>`. */
export function shapeProblems(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = testName(node);
      const body = name === null ? null : bodyOf(node);
      if (name !== null && body !== null) {
        const problem = sectionProblem(body.getFullText());
        if (problem !== null) out.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${name}: ${problem}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** Test code: a test, the fixtures or assertions beside it, or a file of tests/. */
export const isTestCode = (file: string) => /\.(test|fixtures|assertions)\.ts$/u.test(file) || file.startsWith("tests/");

export const CLOCK_RULE = "a test reads no clock and starts no timer: it takes a FakeClock (tests/scripts/ alone drive real processes)";

/** Every clock read and timer of test code outside tests/scripts/, as `<file>:<line>: <read>: <rule>`. */
export function clockProblems(file: string, text: string): string[] {
  if (!isTestCode(file) || file.startsWith("tests/scripts/")) return [];
  return clockReads(file, text, true).map((hit) => `${hit.file}:${hit.line}: ${hit.what}: ${CLOCK_RULE}`);
}

export const DOUBLES_RULE = "a double lives in tests/support/doubles/: set a field of its fake, never derive one beside a test";

/** Every double test code derives outside tests/support/doubles/, as `<file>:<line>: <double>: <rule>`. Runtime
 *  code is left alone: an adapter implements its port. */
export function doubleProblems(
  file: string, text: string, ports: ReadonlySet<string>, methods: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  if (!isTestCode(file) || file.startsWith("tests/support/doubles/")) return [];
  return derivedDoubles(file, text, ports, methods).map((hit) => `${hit.file}:${hit.line}: ${hit.what}: ${DOUBLES_RULE}`);
}

export const MODULE_RULE = "a test of src/ sits beside its module: <module>[.<facet>].test.ts next to <module>.ts";

/** What is wrong with where a test of src/ sits, as `<file>: <rule>`; null when `<module>.ts`, its name up to the
 *  first dot, is among `files` in the same folder. */
export function moduleProblem(file: string, files: ReadonlySet<string>): string | null {
  if (!file.startsWith("src/") || !file.endsWith(".test.ts")) return null;
  const folder = file.slice(0, file.lastIndexOf("/") + 1);
  const module = `${folder}${file.slice(folder.length).split(".")[0]}.ts`;
  return files.has(module) ? null : `${file}: ${MODULE_RULE}`;
}
