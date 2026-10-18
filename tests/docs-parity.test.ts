// The documentation parity check (scripts/check-docs-parity.mjs), run for real on scratch checkouts:
// a conformant pair of pages passes, then one case per rule it enforces: a missing twin (and the
// --pending flag that excuses one while it is written), the heading levels, the fenced code blocks,
// the rows of the tables, and the two toc.yml listing the same pages in the same order. Run:
//   node --test tests/docs-parity.test.ts
import { after, describe, it } from "node:test";
import { match, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-docs-parity.mjs", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "docs-parity-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const ENGLISH = [
  "# Getting started", "", "A sentence.", "", "## Settings", "",
  "```bash", "npm ci   # the tooling", "```", "",
  "| Key | Value |", "|---|---|", "| a | 1 |", "", "### Deeper", "", "Done.", "",
].join("\n");
const FRENCH = [
  "# Premiers pas", "", "Une phrase.", "", "## Settings", "",
  "```bash", "npm ci   # the tooling", "```", "",
  "| Clé | Valeur |", "|---|---|", "| a | 1 |", "", "### Plus loin", "", "Fait.", "",
].join("\n");
const TOC = [
  "- name: Getting started", "  href: getting-started.md",
  "- name: Decisions", "  items:", "    - name: ADR 0001", "      href: adr/0001-x.md", "",
].join("\n");
const TOC_FR = [
  "- name: Premiers pas", "  href: getting-started.md",
  "- name: Décisions (en anglais)", "  items:", "    - name: ADR 0001 (en anglais)", "      href: ../adr/0001-x.md", "",
].join("\n");
const BASE: Record<string, string> = {
  "docs/getting-started.md": ENGLISH,
  "docs/fr/getting-started.md": FRENCH,
  "docs/toc.yml": TOC,
  "docs/fr/toc.yml": TOC_FR,
  "docs/adr/0001-x.md": "# ADR 0001\n\nEnglish only.\n",
};

let cases = 0;
/** A scratch checkout: the conformant pair, with `files` added, replaced or (undefined) removed. */
function checkout(files: Record<string, string | undefined> = {}): string {
  const root = join(scratch, `case-${(cases += 1)}`);
  for (const [path, text] of Object.entries({ ...BASE, ...files })) {
    if (text === undefined) continue;
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root: string, ...args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [script, "--root", root, ...args], { encoding: "utf-8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("the documentation parity check", () => {
  it("passes a conformant pair, its toc.yml twins and an ADR left in English", () => {
    const { status, output } = run(checkout());
    strictEqual(status, 0, output);
    match(output, /docs parity: ok \(1 pages paired, 2 navigation entries\)/);
  });

  it("fails on a page without its French twin, unless the page is pending", () => {
    const root = checkout({ "docs/fr/getting-started.md": undefined });
    const missing = run(root);
    strictEqual(missing.status, 1, missing.output);
    match(missing.output, /docs\/fr\/getting-started\.md: missing/);
    const pending = run(root, "--pending", "getting-started.md");
    strictEqual(pending.status, 0, pending.output);
    match(pending.output, /1 pending/);
  });

  it("fails on a French page without an English twin", () => {
    const { status, output } = run(checkout({ "docs/fr/extra.md": "# En plus\n" }));
    strictEqual(status, 1, output);
    match(output, /docs\/fr\/extra\.md: no docs\/extra\.md/);
  });

  it("fails when the heading levels differ", () => {
    const { status, output } = run(checkout({ "docs/fr/getting-started.md": FRENCH.replace("### Plus loin", "## Plus loin") }));
    strictEqual(status, 1, output);
    match(output, /docs\/fr\/getting-started\.md: headings: # ## ### in English, # ## ## in French/);
  });

  it("fails when a code block differs in content, info string or number", () => {
    const content = run(checkout({ "docs/fr/getting-started.md": FRENCH.replace("# the tooling", "# l'outillage") }));
    strictEqual(content.status, 1, content.output);
    match(content.output, /code block 1 \(bash\): the content differs from its line 1/);
    const info = run(checkout({ "docs/fr/getting-started.md": FRENCH.replace("```bash", "```sh") }));
    strictEqual(info.status, 1, info.output);
    match(info.output, /code block 1: info string "bash" in English, "sh" in French/);
    const number = run(checkout({ "docs/fr/getting-started.md": FRENCH.replace("```bash\nnpm ci   # the tooling\n```\n", "") }));
    strictEqual(number.status, 1, number.output);
    match(number.output, /code blocks: 1 in English, 0 in French/);
  });

  it("fails when a table has not the same number of rows", () => {
    const { status, output } = run(checkout({ "docs/fr/getting-started.md": FRENCH.replace("| a | 1 |", "| a | 1 |\n| b | 2 |") }));
    strictEqual(status, 1, output);
    match(output, /table 1: 3 rows in English, 4 in French/);
  });

  it("fails when the two toc.yml do not list the same pages in the same order", () => {
    const dropped = run(checkout({ "docs/fr/toc.yml": TOC_FR.split("\n").slice(0, 2).join("\n") + "\n" }));
    strictEqual(dropped.status, 1, dropped.output);
    match(dropped.output, /docs\/fr\/toc\.yml: entry 2 is \(none\), docs\/toc\.yml has docs\/adr\/0001-x\.md/);
    const reordered = run(checkout({
      "docs/toc.yml": TOC + "- name: Configuration\n  href: configuration.md\n",
      "docs/configuration.md": "# Configuration\n",
      "docs/fr/configuration.md": "# Configuration\n",
      "docs/fr/toc.yml": "- name: Configuration\n  href: configuration.md\n" + TOC_FR,
    }));
    strictEqual(reordered.status, 1, reordered.output);
    match(reordered.output, /entry 1 is docs\/configuration\.md, docs\/toc\.yml has docs\/getting-started\.md/);
  });
});
