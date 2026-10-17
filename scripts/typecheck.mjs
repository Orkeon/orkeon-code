#!/usr/bin/env node
// Type check of the whole project (tsconfig.json), through the TypeScript API,
// one line per diagnostic (`file:line:col TSnnnn message`) and a count.
//
// Crews start with the Orkeon version directive in its line-comment form,
// `// @orkeon-script 1.0` (Orkeon.Scripting VersionDirectiveParser), which tsc
// reads as a plain comment: the project checks as it is, nothing is rewritten.
//
//   npm run typecheck
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const configPath = join(root, "tsconfig.json");
const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  process.exit(2);
}
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const diagnostics = ts.getPreEmitDiagnostics(program);

for (const d of diagnostics) {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file && d.start !== undefined) {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(`${relative(root, d.file.fileName)}:${line + 1}:${character + 1} TS${d.code} ${message}`);
  } else {
    console.log(`TS${d.code} ${message}`);
  }
}
console.log(`\n${diagnostics.length} error(s) in ${parsed.fileNames.length} file(s), TypeScript ${ts.version}`);
process.exit(diagnostics.length === 0 ? 0 : 1);
