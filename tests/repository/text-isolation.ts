// Where the text of src/ lives (ADR 0026): natural-language text sits in the text files of the layer that reads it
// (prompts.ts for the model, messages.ts for the user, markers.ts for the values a writer and a reader share), never
// tangled with logic. This module finds the prose a logic file still holds: every string literal, and the static
// parts of every template, that read as a sentence. Pure: the caller hands the source text, and each literal names
// its line, its text and the declaration that holds it. The text files hold text only, constants and template
// functions: textFileLogic finds the logic one still holds.
import { posix } from "node:path";
import ts from "typescript";

/** A literal of a logic file that reads as prose, and the nearest named declaration, property or function around it. */
export interface TextLiteral { line: number; text: string; owner: string }

/** A literal allowed where it stands: in the files `file` matches (a path, or a glob with `*` and `**`), when its
 *  owner is `name`. */
export interface TextException { file: string; name: string; reason: string }

/** The text files: read by nobody but their importers, never checked. */
const TEXT_BASENAMES = new Set(["prompts.ts", "messages.ts", "markers.ts", "built-in-charters.ts", "design-rules.ts", "reading-rule.ts"]);

/** Whether a file is a text file of src/: a prompts.ts, messages.ts or markers.ts, a file under a prompts/ folder, or
 *  one of the pure-text modules that keep their name (`*-charter.ts`, built-in-charters.ts, design-rules.ts,
 *  reading-rule.ts). */
export function TEXT_FILES(file: string): boolean {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return TEXT_BASENAMES.has(base) || base.endsWith("-charter.ts") || `/${file}`.includes("/prompts/");
}

/** A construct of a text file that is logic, and the nearest named declaration around it (for an import, the name
 *  imported). */
export interface LogicFinding { line: number; construct: string; owner: string }

/** A file and what the guard found in it: the prose of a logic file, the logic of a text file. */
export interface ScannedFile { file: string; literals: TextLiteral[]; logic: LogicFinding[] }

/** The prose allowed inline, each with why. */
export const TEXT_EXCEPTIONS: readonly TextException[] = [
  {
    file: "src/commands/**/*.cmd.ts",
    name: "description",
    reason: "scripts/gen-commands-doc.mjs reads the description of each command from its *.cmd.ts",
  },
  {
    file: "src/shared/infrastructure/orkeon/shell-jobs.ts",
    name: "WAIT_SCRIPT_CONTENT",
    reason: "the JavaScript source of the wait script written under .orkeon/dev/bin, code rather than text",
  },
];

/** The logic allowed in a text file, each with why: `name` is the owner of the construct, or the name imported. */
export const TEXT_FILE_EXCEPTIONS: readonly TextException[] = [
  {
    file: "src/commands/_lib/settings/messages.ts",
    name: "USER_CONFIG_FILE_PATH",
    reason: "the path of the user settings file a hint names, a constant of the config store in shared/application",
  },
  ...["CLI_BUILD", "CLI_NAME", "CLI_VERSION", "ORKEON_RUNTIME_PIN"].map((name) => ({
    file: "src/commands/_lib/status/messages.ts",
    name,
    reason: "a build constant of commands/_lib/status/meta.ts the version line names",
  })),
];

/** A word of prose: letters, at least two, lower case after the first (an identifier in camelCase or a constant in
 *  capitals is no word), an apostrophe or a hyphen inside, punctuation around. */
const WORD = /^[("'`[]*[A-Za-z][a-z'’]*(?:-[a-z]+)*[a-z][.,;:!?)"'`\]]*$/u;

/** A shell command: the name of a command-line tool, a space, then arguments. */
const COMMAND = /^(?:git|gh|npm|npx|node|dotnet|uv|bash) /u;

/** Whether a text reads as prose: three words or more, or longer than 60 characters with a space inside and at least
 *  one word. A path, a flag, a regex source or an identifier holds no word. A shell command (a tool name first, four
 *  words at most, no colon followed by a space) is no prose either. */
export function isProse(text: string): boolean {
  const words = text.split(/\s+/u).filter((token) => WORD.test(token)).length;
  if (COMMAND.test(text) && words <= 4 && !/:\s/u.test(text)) return false;
  return words >= 3 || (text.length > 60 && /\s/u.test(text) && words >= 1);
}

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** Whether a literal is code rather than text where it stands: a module specifier, a literal type, a property name. */
function isCodePosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent) || ts.isImportTypeNode(parent.parent)) return true;
  return (parent as { name?: ts.Node }).name === node;
}

/** The name of a declaration, a property or a function, or null when the node names nothing. */
function nameOf(node: ts.Node): string | null {
  const name = (node as { name?: ts.Node }).name;
  if (name === undefined) return null;
  if (!(ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)
    || ts.isPropertySignature(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)
    || ts.isClassDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isShorthandPropertyAssignment(node))) return null;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isPrivateIdentifier(name) ? name.text : name.getText();
}

function ownerOf(node: ts.Node): string {
  for (let at = node.parent; at !== undefined; at = at.parent) {
    const name = nameOf(at);
    if (name !== null) return name;
  }
  return "(module)";
}

/** Every literal of a logic file that reads as prose: string literals, templates without substitution, and the static
 *  parts of a template joined. A declaration file and a text file hold none. */
export function textLiterals(file: string, sourceText: string): TextLiteral[] {
  if (file.endsWith(".d.ts") || TEXT_FILES(file)) return [];
  const source = parse(file, sourceText);
  const found: TextLiteral[] = [];
  const visit = (node: ts.Node): void => {
    let text: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) text = node.head.text + node.templateSpans.map((s) => s.literal.text).join("");
    if (text !== null && !isCodePosition(node) && isProse(text)) {
      found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, text, owner: ownerOf(node) });
    }
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
    else for (const span of node.templateSpans) visit(span.expression);
  };
  visit(source);
  return found;
}

/** A glob over repository paths as a regular expression: `**` any folders, `*` any name part. */
function globPattern(glob: string): RegExp {
  const body = glob.split("**/").map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")).join("[^/]*"));
  return new RegExp(`^${body.join("(?:.*/)?")}$`, "u");
}

/** The exception that allows what `owner` holds in a file, or null. */
export function exceptionFor(file: string, owner: string, exceptions: readonly TextException[]): TextException | null {
  return exceptions.find((e) => e.name === owner && globPattern(e.file).test(file)) ?? null;
}

/** The prose of a logic file that no exception allows, one line each: `<file>:<line>: <owner>: <text>`. */
export function proseProblems(file: string, literals: readonly TextLiteral[], exceptions: readonly TextException[] = TEXT_EXCEPTIONS): string[] {
  return literals
    .filter((literal) => exceptionFor(file, literal.owner, exceptions) === null)
    .map((l) => `${file}:${l.line}: ${l.owner}: ${JSON.stringify(l.text.length > 80 ? `${l.text.slice(0, 77)}...` : l.text)}`);
}

/** The prose a logic file holds that no exception allows, read from its source. */
export function textProblems(file: string, sourceText: string, exceptions: readonly TextException[] = TEXT_EXCEPTIONS): string[] {
  return proseProblems(file, textLiterals(file, sourceText), exceptions);
}

/** The logic of a text file that no exception allows, one line each: `<file>:<line>: <owner>: <construct>`. */
export function logicProblems(file: string, logic: readonly LogicFinding[], exceptions: readonly TextException[] = TEXT_FILE_EXCEPTIONS): string[] {
  return logic
    .filter((finding) => exceptionFor(file, finding.owner, exceptions) === null)
    .map((f) => `${file}:${f.line}: ${f.owner}: ${f.construct}`);
}

/** The exceptions that allow nothing among the owners found in the files: each must go. */
export function unusedExceptions(owners: readonly { file: string; owner: string }[], exceptions: readonly TextException[]): TextException[] {
  const used = new Set<TextException>();
  for (const { file, owner } of owners) {
    const exception = exceptionFor(file, owner, exceptions);
    if (exception !== null) used.add(exception);
  }
  return exceptions.filter((e) => !used.has(e));
}

// ── The text files: text only ──

/** The statements and expressions that are logic wherever they stand in a text file. */
const LOGIC_KINDS: ReadonlyMap<ts.SyntaxKind, string> = new Map([
  [ts.SyntaxKind.ForStatement, "for"],
  [ts.SyntaxKind.ForOfStatement, "for"],
  [ts.SyntaxKind.ForInStatement, "for"],
  [ts.SyntaxKind.WhileStatement, "while"],
  [ts.SyntaxKind.DoStatement, "do"],
  [ts.SyntaxKind.SwitchStatement, "switch"],
  [ts.SyntaxKind.TryStatement, "try"],
  [ts.SyntaxKind.ClassDeclaration, "class"],
  [ts.SyntaxKind.ClassExpression, "class"],
  [ts.SyntaxKind.AwaitExpression, "await"],
]);

/** Whether a module may lend a value to a text file: another text file, or a module of a domain/ folder. */
function lendsValues(file: string, specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const target = posix.normalize(posix.join(posix.dirname(file), specifier));
  return TEXT_FILES(target) || `/${target}`.includes("/domain/");
}

/** The names a declaration imports or re-exports as values: none for a type-only one. */
function valueNames(node: ts.ImportDeclaration | ts.ExportDeclaration): string[] {
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return [];
    if (node.exportClause === undefined || !ts.isNamedExports(node.exportClause)) return ["*"];
    return node.exportClause.elements.filter((e) => !e.isTypeOnly).map((e) => e.name.text);
  }
  const clause = node.importClause;
  if (clause === undefined) return ["(side effect)"];
  if (clause.isTypeOnly) return [];
  const bindings = clause.namedBindings;
  return [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(bindings !== undefined && ts.isNamespaceImport(bindings) ? [bindings.name.text] : []),
    ...(bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements.filter((e) => !e.isTypeOnly).map((e) => e.name.text) : []),
  ];
}

/** Whether a node is an `async` function. */
const isAsync = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);

/** The logic a text file holds: an `async` function, `await`, a loop (`for`, `while`, `do`), a `switch`, a `try`, a
 *  class, a variable that changes (`let`, `var`), and a value imported from a module that is neither a text file nor a
 *  module of a domain/ folder (a port, an application or infrastructure module, a command use case); a type imported
 *  is no value. A text file holds constants and template functions only: parameters in, text out, a ternary, an early
 *  return, a `.map` or a `.join` to render a list. A logic file has none of this to report. */
export function textFileLogic(file: string, sourceText: string): LogicFinding[] {
  if (file.endsWith(".d.ts") || !TEXT_FILES(file)) return [];
  const source = parse(file, sourceText);
  const found: LogicFinding[] = [];
  const at = (node: ts.Node, construct: string, owner = nameOf(node) ?? ownerOf(node)): void => {
    found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, construct, owner });
  };
  const visit = (node: ts.Node): void => {
    const kind = LOGIC_KINDS.get(node.kind);
    if (kind !== undefined) at(node, kind);
    if (isAsync(node)) at(node, "async");
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Let) !== 0) at(node, "let");
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) at(node, "var");
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier) && !lendsValues(file, node.moduleSpecifier.text)) {
      for (const name of valueNames(node)) at(node, `value imported from ${node.moduleSpecifier.text}`, name);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** A file read once: the prose of a logic file, the logic of a text file. */
export function scanFile(file: string, sourceText: string): ScannedFile {
  return { file, literals: textLiterals(file, sourceText), logic: textFileLogic(file, sourceText) };
}
