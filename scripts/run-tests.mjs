#!/usr/bin/env node
// Unit test runner: every *.test.ts under tests/, run by `node --test`.
// Node 24 strips TypeScript types natively, so no transpiler is involved: the
// sources run as written, with their explicit `.ts` import specifiers.
// The files are enumerated here rather than globbed so the list is the same on
// every shell and platform. Used by `npm test`.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

const files = ["tests"].flatMap((d) => walk(join(root, d))).sort();
if (files.length === 0) {
  console.error("no test files found under tests/");
  process.exit(1);
}
console.log(`running ${files.length} test file(s)`);
const args = ["--test", ...process.argv.slice(2), ...files.map((f) => relative(root, f))];
const run = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
process.exit(run.status ?? 1);
