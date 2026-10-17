#!/usr/bin/env node
// Bundle check: every crew (*.ork.ts) and command (*.cmd.ts) must bundle into one
// self-contained ESM script with the SAME esbuild flags the Orkeon runtime uses
// (Orkeon/orkeon src/scripting/Orkeon.Scripting/Toolchain/EsbuildTranspiler.cs,
// BundleArgs). If esbuild resolves every import here, the runtime resolves it too.
//
// `--platform=neutral` is also what keeps Node out of the runtime code: a
// `node:fs` import in src/ fails here, because the runtime is Jint, not Node.
//
// The esbuild version is pinned in package.json to the one the pinned Orkeon
// runtime ships (see .orkeon-version and docs/development.md).
//
//   npm run bundle:check
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
// Resolve the binary through the package rather than node_modules/.bin, which
// does not exist on every platform layout.
const esbuild = require("esbuild");

// Mirrors EsbuildTranspiler.BundleArgs exactly.
const BUNDLE_OPTIONS = {
  bundle: true,
  loader: { ".ts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js" },
  format: "esm",
  platform: "neutral",
  target: "es2022",
  write: false,
  logLevel: "silent",
};

function walk(dir, match, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, match, acc);
    else if (match(p)) acc.push(p);
  }
  return acc;
}

const crews = walk(join(root, "src", "crews"), (p) => p.endsWith(".ork.ts"));
const commands = walk(join(root, "src", "commands"), (p) => p.endsWith(".cmd.ts"));
const targets = [...crews, ...commands].sort();

let failed = 0;
for (const t of targets) {
  const name = relative(root, t);
  try {
    const out = esbuild.buildSync({ ...BUNDLE_OPTIONS, entryPoints: [t] });
    const text = out.outputFiles?.[0]?.text ?? "";
    if (text.trim().length === 0) throw new Error("empty bundle");
    process.stdout.write(`ok   ${name}\n`);
  } catch (err) {
    failed++;
    const detail = (err.errors ?? []).map((e) => `  ${e.location?.file ?? ""}:${e.location?.line ?? ""} ${e.text}`).join("\n");
    process.stdout.write(`FAIL ${name}\n${detail || String(err.message).slice(0, 600)}\n`);
  }
}
process.stdout.write(
  `\n${targets.length - failed}/${targets.length} bundled (${crews.length} crews, ${commands.length} commands) with esbuild ${esbuild.version}\n`,
);
process.exit(failed === 0 ? 0 : 1);
