// What the repository rules read from the syntax tree of one file, beyond its imports: the reads of the clock and
// the timers, the ports a module names, the methods a double declares, and the doubles derived outside
// tests/support/doubles/. Pure: the caller hands the source text, and each hit names its file, its line and what it is.
import ts from "typescript";

/** One thing a rule looks for, where it was found. */
export interface SyntaxHit { file: string; line: number; what: string }

const TIMERS = new Set(["setTimeout", "setInterval"]);
const DOUBLE_CLASS = /^(Fake|Stub)[A-Z]/u;

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

function hitAt(source: ts.SourceFile, node: ts.Node, what: string): SyntaxHit {
  return { file: source.fileName, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, what };
}

/** `name` or `globalThis.name`: whether the expression names that global. */
function namesGlobal(node: ts.Expression, names: ReadonlySet<string>): string | null {
  if (ts.isIdentifier(node)) return names.has(node.text) ? node.text : null;
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "globalThis") {
    return names.has(node.name.text) ? node.name.text : null;
  }
  return null;
}

const DATE = new Set(["Date"]);

/**
 * Every read of the clock: `new Date()` with no argument, `Date()`, `Date.now()`; and with `timers`, every call of
 * `setTimeout` or `setInterval`. `new Date(x)`, `Date.parse` and `Date.UTC` read no clock.
 */
export function clockReads(file: string, text: string, timers: boolean): SyntaxHit[] {
  const source = parse(file, text);
  const hits: SyntaxHit[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && namesGlobal(node.expression, DATE) && (node.arguments?.length ?? 0) === 0) {
      hits.push(hitAt(source, node, "new Date()"));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (namesGlobal(callee, DATE)) hits.push(hitAt(source, node, "Date()"));
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "now" && namesGlobal(callee.expression, DATE)) {
        hits.push(hitAt(source, node, "Date.now()"));
      } else if (timers) {
        const timer = namesGlobal(callee, TIMERS);
        if (timer) hits.push(hitAt(source, node, `${timer}()`));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

/** Whether a member of an interface or a type literal is a function: a method, or a property typed by a function. */
function isFunctionMember(member: ts.TypeElement): boolean {
  if (ts.isMethodSignature(member)) return true;
  return ts.isPropertySignature(member) && member.type !== undefined && ts.isFunctionTypeNode(member.type);
}

/**
 * The ports a module exports: each exported interface, or type alias of an object type, with at least one function
 * among its members. A type of data only (a result, an options bag) is no port.
 */
export function portNames(file: string, text: string): Set<string> {
  const names = new Set<string>();
  for (const statement of parse(file, text).statements) {
    const exported = ts.canHaveModifiers(statement)
      && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    const members = ts.isInterfaceDeclaration(statement) ? statement.members
      : ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type) ? statement.type.members
      : null;
    if (members?.some(isFunctionMember)) names.add((statement as ts.InterfaceDeclaration | ts.TypeAliasDeclaration).name.text);
  }
  return names;
}

/** The methods each class of a module declares or inherits from a class of the same module, by class name: what a
 *  test must not replace on an instance. */
export function classMethods(file: string, text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const statement of parse(file, text).statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined) continue;
    const parent = statement.heritageClauses?.find((c) => c.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
    const inherited = parent !== undefined && ts.isIdentifier(parent) ? out.get(parent.text) ?? [] : [];
    const methods = statement.members.flatMap((m) => (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) ? [m.name.text] : []));
    out.set(statement.name.text, new Set([...inherited, ...methods]));
  }
  return out;
}

/** The name a type node refers to (`Files`, `ports.Files`, `Promise<Files>`'s `Files`), or null. */
function typeName(type: ts.TypeNode | undefined): string | null {
  if (type === undefined || !ts.isTypeReferenceNode(type)) return null;
  const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text;
  if (name === "Promise" && type.typeArguments?.length === 1) return typeName(type.typeArguments[0]);
  return name;
}

/** An expression without the parentheses and casts around it. */
function bare(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) {
    node = node.expression;
  }
  return node;
}

/** The object literals a function returns: its concise body, or the expression of each of its own `return`s. */
function returnedObjects(fn: ts.SignatureDeclaration & { body?: ts.Node }): ts.ObjectLiteralExpression[] {
  const body = fn.body;
  if (body === undefined) return [];
  if (!ts.isBlock(body)) return ts.isExpression(body) && ts.isObjectLiteralExpression(bare(body)) ? [bare(body) as ts.ObjectLiteralExpression] : [];
  const out: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(bare(node.expression))) {
      out.push(bare(node.expression) as ts.ObjectLiteralExpression);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

/** The class a `new Fake…()` or `new Stub…()` builds, or null. */
function doubleBuilt(node: ts.Expression | undefined): string | null {
  if (node === undefined) return null;
  const e = bare(node);
  return ts.isNewExpression(e) && ts.isIdentifier(e.expression) && DOUBLE_CLASS.test(e.expression.text) ? e.expression.text : null;
}

/**
 * Every double a file builds on its own: a class that extends a `Fake…` or `Stub…`, or implements a port; an object
 * literal typed as a port (a variable's type, a function's return type, `as` or `satisfies`); a method of a double,
 * built by `new Fake…()` in the file, replaced on the instance. `ports` are the port names, `methods` the methods of
 * each double (fields a test sets, such as `pick` or `onAsk`, are no methods).
 */
export function derivedDoubles(
  file: string, text: string, ports: ReadonlySet<string>, methods: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): SyntaxHit[] {
  const source = parse(file, text);
  const hits: SyntaxHit[] = [];
  const instances = new Map<string, string>();
  const literal = (node: ts.Node, port: string | null) => {
    if (port !== null && ports.has(port)) hits.push(hitAt(source, node, `an object literal implements ${port}`));
  };
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const built = doubleBuilt(node.initializer);
      if (built) instances.set(node.name.text, built);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const name = node.name?.text ?? "(anonymous)";
      for (const clause of node.heritageClauses ?? []) {
        for (const type of clause.types) {
          const parent = ts.isIdentifier(type.expression) ? type.expression.text : null;
          if (parent === null) continue;
          if (clause.token === ts.SyntaxKind.ExtendsKeyword && DOUBLE_CLASS.test(parent)) {
            hits.push(hitAt(source, node, `class ${name} extends ${parent}`));
          } else if (clause.token === ts.SyntaxKind.ImplementsKeyword && ports.has(parent)) {
            hits.push(hitAt(source, node, `class ${name} implements ${parent}`));
          }
        }
      }
    } else if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(bare(node.initializer))) {
      literal(node, typeName(node.type));
    } else if ((ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) && ts.isObjectLiteralExpression(bare(node.expression))) {
      literal(node, typeName(node.type));
    } else if (ts.isFunctionLike(node) && "body" in node) {
      for (const object of returnedObjects(node)) literal(object, typeName(node.type));
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) {
      const double = instances.get(node.left.expression.text);
      const method = node.left.name.text;
      if (double && methods.get(double)?.has(method)) {
        hits.push(hitAt(source, node, `${double}.${method} replaced on an instance`));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}
