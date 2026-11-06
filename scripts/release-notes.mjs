#!/usr/bin/env node
// The body of a GitHub Release: the section of a version in CHANGELOG.md. GitHub refuses a body over 125000
// characters, so a section over LIMIT is cut at a whole line and ends on a link to the complete changelog at the tag.
//   node scripts/release-notes.mjs <version> [changelog]
import { readFileSync } from "node:fs";

const LIMIT = 120000;
const version = process.argv[2];
const changelog = process.argv[3] ?? new URL("../CHANGELOG.md", import.meta.url);
if (!version) {
  console.error("release-notes: usage: node scripts/release-notes.mjs <version> [changelog]");
  process.exit(2);
}

const lines = readFileSync(changelog, "utf-8").split("\n");
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
const rest = start < 0 ? [] : lines.slice(start + 1);
const next = rest.findIndex((line) => line.startsWith("## ["));
const section = (next < 0 ? rest : rest.slice(0, next)).join("\n").trim();
if (!section) {
  console.error(`release-notes: CHANGELOG.md has no section [${version}]`);
  process.exit(1);
}

function cut(text) {
  const end = `\n\nThese notes are cut to fit a GitHub Release. The complete list is in the ` +
    `[changelog](https://github.com/Orkeon/orkeon-code/blob/v${version}/CHANGELOG.md).`;
  const room = LIMIT - end.length;
  return text.slice(0, text.lastIndexOf("\n", room)).trimEnd() + end;
}

process.stdout.write(`${section.length > LIMIT ? cut(section) : section}\n`);
