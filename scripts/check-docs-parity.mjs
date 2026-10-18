#!/usr/bin/env node
// Parity of the documentation in its two languages: every page of docs/ has its French twin in
// docs/fr/, and the twins keep the same shape. A French page follows its English page sentence for
// sentence, and what is not prose is kept as it is, so the check reads both and fails when
//
//   1. a page of docs/*.md has no docs/fr/*.md, or the reverse (the ADRs, docs/adr/, stay in English);
//   2. the twins do not have the same sequence of heading levels (#, ##, ###...);
//   3. their fenced code blocks differ: in number, in info string or in content, byte for byte;
//   4. their tables do not have the same number of rows, table for table;
//   5. docs/toc.yml and docs/fr/toc.yml do not list the same pages, in the same order.
//
//   node scripts/check-docs-parity.mjs                      the whole documentation (npm run check)
//   node scripts/check-docs-parity.mjs --pending <page>...  a page whose translation is not written
//                                                           yet may be missing (its name, .md or not)
//   node scripts/check-docs-parity.mjs --root <dir>         another checkout (the tests)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = "docs";
const FRENCH = "fr";
const TOC = "toc.yml";

/** The heading levels, fenced code blocks and tables of a Markdown text, in order. */
export function scanMarkdown(text) {
  const headings = [];
  const blocks = [];
  const tables = [];
  let fence = null;
  let table = null;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (fence) {
      // A fence closes on the same character, at least as long, with nothing after it.
      const closing = /^\s*(?:>\s*)*(`{3,}|~{3,})\s*$/.exec(line);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
        blocks.push({ info: fence.info, body: fence.lines.join("\n") });
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const opening = /^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      fence = { char: opening[1][0], length: opening[1].length, info: opening[2].trim(), lines: [] };
      table = null;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      if (!table) tables.push((table = { rows: 0 }));
      table.rows += 1;
      continue;
    }
    table = null;
    const heading = /^ {0,3}(#{1,6})(?:\s|$)/.exec(line);
    if (heading) headings.push(heading[1].length);
  }
  if (fence) blocks.push({ info: fence.info, body: fence.lines.join("\n") });
  return { headings, blocks, tables: tables.map((t) => t.rows) };
}

const levels = (headings) => headings.map((n) => "#".repeat(n)).join(" ") || "(none)";

/** What differs between an English page and its French twin: one line per problem, none when alike. */
export function comparePages(english, french) {
  const problems = [];
  const en = scanMarkdown(english);
  const fr = scanMarkdown(french);
  if (en.headings.join() !== fr.headings.join()) {
    problems.push(`headings: ${levels(en.headings)} in English, ${levels(fr.headings)} in French`);
  }
  if (en.blocks.length !== fr.blocks.length) {
    problems.push(`code blocks: ${en.blocks.length} in English, ${fr.blocks.length} in French`);
  } else {
    en.blocks.forEach((block, i) => {
      const twin = fr.blocks[i];
      if (block.info !== twin.info) {
        problems.push(`code block ${i + 1}: info string "${block.info}" in English, "${twin.info}" in French`);
      } else if (block.body !== twin.body) {
        const a = block.body.split("\n");
        const b = twin.body.split("\n");
        const at = a.findIndex((l, n) => l !== b[n]);
        problems.push(`code block ${i + 1} (${block.info || "no info string"}): the content differs from its line ${(at < 0 ? a.length : at) + 1}`);
      }
    });
  }
  if (en.tables.length !== fr.tables.length) {
    problems.push(`tables: ${en.tables.length} in English, ${fr.tables.length} in French`);
  } else {
    en.tables.forEach((rows, i) => {
      if (rows !== fr.tables[i]) problems.push(`table ${i + 1}: ${rows} rows in English, ${fr.tables[i]} in French`);
    });
  }
  return problems;
}

/** The href entries of a toc.yml, in order, resolved against the folder of the file. */
export function tocHrefs(text, folder) {
  const hrefs = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(?:-\s+)?href:\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[1];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) value = value.slice(1, -1);
    hrefs.push(posix.normalize(posix.join(folder, value)));
  }
  return hrefs;
}

const pageName = (file) => file.replace(/\.md$/, "");

/** Every problem of the checkout at `root`; `pending` names the pages whose French twin may be missing. */
export function checkParity(root, pending = new Set()) {
  const problems = [];
  const englishDir = join(root, DOCS);
  const frenchDir = join(root, DOCS, FRENCH);
  const pages = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : []);
  const read = (path) => readFileSync(path, "utf8");
  const english = pages(englishDir);
  const french = pages(frenchDir);

  for (const page of english) {
    if (!french.includes(page) && !pending.has(pageName(page))) {
      problems.push(`docs/fr/${page}: missing, the French twin of docs/${page} (--pending ${pageName(page)} while it is being written)`);
    }
  }
  for (const page of french) {
    if (!english.includes(page)) problems.push(`docs/fr/${page}: no docs/${page} to be the twin of`);
  }

  let compared = 0;
  for (const page of english) {
    if (!french.includes(page)) continue;
    compared += 1;
    for (const problem of comparePages(read(join(englishDir, page)), read(join(frenchDir, page)))) {
      problems.push(`docs/fr/${page}: ${problem}`);
    }
  }

  let entries = 0;
  const englishToc = join(englishDir, TOC);
  const frenchToc = join(frenchDir, TOC);
  if (!existsSync(englishToc)) {
    problems.push(`docs/toc.yml: missing`);
  } else if (!existsSync(frenchToc)) {
    problems.push(`docs/fr/toc.yml: missing`);
  } else {
    const expected = tocHrefs(read(englishToc), DOCS);
    const found = tocHrefs(read(frenchToc), posix.join(DOCS, FRENCH))
      .map((h) => (h.startsWith(`${DOCS}/${FRENCH}/`) ? `${DOCS}/${h.slice(DOCS.length + FRENCH.length + 2)}` : h));
    entries = expected.length;
    const length = Math.max(expected.length, found.length);
    for (let i = 0; i < length; i += 1) {
      if (expected[i] === found[i]) continue;
      problems.push(`docs/fr/toc.yml: entry ${i + 1} is ${found[i] ?? "(none)"}, docs/toc.yml has ${expected[i] ?? "(none)"} (the same pages, in the same order)`);
      break;
    }
  }
  return { problems, compared, entries };
}

function parseArgs(argv) {
  let root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const pending = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      if (i + 1 >= argv.length) throw new Error("--root takes a folder");
      root = resolve(argv[(i += 1)]);
    } else if (arg === "--pending") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) pending.add(pageName(argv[(i += 1)]));
      if (pending.size === 0) throw new Error("--pending takes the name of a page, or several");
    } else {
      throw new Error(`unknown argument ${arg} (--pending <page>..., --root <dir>)`);
    }
  }
  return { root, pending };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`check-docs-parity: ${error.message}`);
    process.exit(2);
  }
  const { problems, compared, entries } = checkParity(options.root, options.pending);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`docs parity: ${problems.length} problem(s)`);
    process.exit(1);
  }
  const pending = options.pending.size > 0 ? `, ${options.pending.size} pending` : "";
  console.log(`docs parity: ok (${compared} pages paired${pending}, ${entries} navigation entries)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
