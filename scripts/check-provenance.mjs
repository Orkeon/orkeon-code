#!/usr/bin/env node
// Provenance gate: Orkeon Code ships original work only.
//
// The agent was designed by studying how existing agentic coding CLIs behave.
// Behaviour can be studied; text cannot be copied. This gate fails on markers
// that point at another product's material (product names, version strings,
// extraction corpora). It cannot judge a paraphrase on its own, so files whose
// CONTENT still needs an original rewrite are listed in provenance-baseline.json
// with the reason, and stay listed until a reviewer has checked the rewrite.
//
//   npm run check:provenance            fails on a marker outside the baseline
//   npm run check:provenance -- --strict  also fails while the baseline is not
//                                          empty: the gate for going public and
//                                          for every release
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

// The markers and the one reference live in provenance-markers.json, which the prompt
// contract test reads too: every rendered prompt is checked against the same list.
const markerFile = JSON.parse(readFileSync(join(root, "scripts", "provenance-markers.json"), "utf8"));
const MARKERS = markerFile.markers.map((m) => new RegExp(m.source, m.flags));
const SCANNED_DIRS = ["src", "tests", "docs", "config", ".github"];
const SCANNED_ROOT_FILES = ["README.md", "README.fr.md", "CHANGELOG.md", "CONTRIBUTING.md", "SECURITY.md", "NOTICE.md", "orkeon-code", "orkeon-code.ps1"];
const EXTENSIONS = new Set([".ts", ".mjs", ".js", ".md", ".json", ".yml", ".yaml", ".sh", ".ps1", ""]);
// This script and its baseline name the markers on purpose.
const SELF = new Set(["scripts/check-provenance.mjs", "scripts/provenance-baseline.json", "scripts/provenance-markers.json"]);
// A reference a contributor may follow to study behaviour, never to copy text: named as is, it is no
// marker. Only the URL itself is exempt; the rest of its line is still scanned.
const REFERENCES = markerFile.references;

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (EXTENSIONS.has(extname(p))) acc.push(p);
  }
  return acc;
}

const baselinePath = join(root, "scripts", "provenance-baseline.json");
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).files ?? {} : {};

const files = [
  ...SCANNED_DIRS.flatMap((d) => walk(join(root, d))),
  ...SCANNED_ROOT_FILES.map((f) => join(root, f)).filter(existsSync),
];

const hits = new Map();
for (const file of files) {
  const rel = relative(root, file).split("\\").join("/");
  if (SELF.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const scanned = REFERENCES.reduce((text, url) => text.split(url).join(" "), line);
    if (MARKERS.some((m) => m.test(scanned))) {
      if (!hits.has(rel)) hits.set(rel, []);
      hits.get(rel).push(`${i + 1}: ${line.trim().slice(0, 140)}`);
    }
  });
}

let failed = false;
for (const [file, lines] of hits) {
  if (file in baseline) continue;
  failed = true;
  console.log(`FAIL ${file} (not in the baseline)`);
  for (const l of lines) console.log(`     ${l}`);
}
for (const [file, reason] of Object.entries(baseline)) {
  const state = hits.has(file) ? `${hits.get(file).length} marker line(s)` : "no marker left: review the content, then remove the entry";
  console.log(`${strict ? "FAIL" : "todo"} ${file} (${state})\n     ${reason}`);
  if (strict) failed = true;
}
const pending = Object.keys(baseline).length;
console.log(`\n${hits.size} file(s) with markers, ${pending} file(s) awaiting an original rewrite${strict ? " (strict)" : ""}`);
process.exit(failed ? 1 : 0);
