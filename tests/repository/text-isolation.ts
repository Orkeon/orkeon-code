// Where the text of src/ lives (ADR 0026): natural-language text sits in the text files of the layer that reads it
// (prompts.ts for the model, messages.ts for the user, markers.ts for the values a writer and a reader share), never
// tangled with logic. This module finds the prose a logic file still holds: every string literal, and the static
// parts of every template, that read as a sentence. Pure: the caller hands the source text, and each literal names
// its line, its text and the declaration that holds it.
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

/** The exception that allows a literal of a file, or null. */
export function exceptionFor(file: string, literal: TextLiteral, exceptions: readonly TextException[] = TEXT_EXCEPTIONS): TextException | null {
  return exceptions.find((e) => e.name === literal.owner && globPattern(e.file).test(file)) ?? null;
}

/** The prose a logic file holds that no exception allows, one line each: `<file>:<line>: <owner>: <text>`. */
export function textProblems(file: string, sourceText: string, exceptions: readonly TextException[] = TEXT_EXCEPTIONS): string[] {
  return textLiterals(file, sourceText)
    .filter((literal) => exceptionFor(file, literal, exceptions) === null)
    .map((l) => `${file}:${l.line}: ${l.owner}: ${JSON.stringify(l.text.length > 80 ? `${l.text.slice(0, 77)}...` : l.text)}`);
}

/** The exceptions no literal of the files matches any more: each must go. */
export function unusedExceptions(files: readonly { file: string; text: string }[], exceptions: readonly TextException[] = TEXT_EXCEPTIONS): TextException[] {
  const used = new Set<TextException>();
  for (const { file, text } of files) {
    for (const literal of textLiterals(file, text)) {
      const exception = exceptionFor(file, literal, exceptions);
      if (exception !== null) used.add(exception);
    }
  }
  return exceptions.filter((e) => !used.has(e));
}
