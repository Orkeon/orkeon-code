// The checkouts the documentation parity check runs on: a conformant pair of pages, its toc.yml twins and an ADR
// left in English, and one case per rule, each a change to that pair with the outcome it must give.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../scripts/check-docs-parity.mjs", import.meta.url));

export const ENGLISH = [
  "# Getting started", "", "A sentence.", "", "## Settings", "",
  "```bash", "npm ci   # the tooling", "```", "",
  "| Key | Value |", "|---|---|", "| a | 1 |", "", "### Deeper", "", "Done.", "",
].join("\n");
export const FRENCH = [
  "# Premiers pas", "", "Une phrase.", "", "## Settings", "",
  "```bash", "npm ci   # the tooling", "```", "",
  "| Clé | Valeur |", "|---|---|", "| a | 1 |", "", "### Plus loin", "", "Fait.", "",
].join("\n");
export const TOC = [
  "- name: Getting started", "  href: getting-started.md",
  "- name: Decisions", "  items:", "    - name: ADR 0001", "      href: adr/0001-x.md", "",
].join("\n");
export const TOC_FR = [
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

/** The files a case changes: a text adds or replaces one, undefined removes it. */
export type Changes = Record<string, string | undefined>;

export interface CheckResult { status: number | null; output: string }

/** Runs the check with `args` on a scratch checkout of the conformant pair with `files` changed, then removes it. */
export function checkParity(files: Changes = {}, args: readonly string[] = []): CheckResult {
  const root = mkdtempSync(join(tmpdir(), "docs-parity-"));
  try {
    for (const [path, text] of Object.entries({ ...BASE, ...files })) {
      if (text === undefined) continue;
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const result = spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf-8" });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export interface ParityCase {
  name: string;
  files: Changes;
  args?: readonly string[];
  status: number;
  /** What the output says. */
  says: RegExp;
}

const WITHOUT_FRENCH_TWIN: Changes = { "docs/fr/getting-started.md": undefined };
const french = (text: string): Changes => ({ "docs/fr/getting-started.md": text });

export const PARITY_CASES: readonly ParityCase[] = [
  {
    name: "passes a conformant pair, its toc.yml twins and an ADR left in English",
    files: {},
    status: 0,
    says: /docs parity: ok \(1 pages paired, 2 navigation entries\)/,
  },
  { name: "fails on a page without its French twin", files: WITHOUT_FRENCH_TWIN, status: 1, says: /docs\/fr\/getting-started\.md: missing/ },
  {
    name: "passes a page without its French twin when the page is pending",
    files: WITHOUT_FRENCH_TWIN,
    args: ["--pending", "getting-started.md"],
    status: 0,
    says: /1 pending/,
  },
  { name: "fails on a French page without an English twin", files: { "docs/fr/extra.md": "# En plus\n" }, status: 1, says: /docs\/fr\/extra\.md: no docs\/extra\.md/ },
  {
    name: "fails when the heading levels differ",
    files: french(FRENCH.replace("### Plus loin", "## Plus loin")),
    status: 1,
    says: /docs\/fr\/getting-started\.md: headings: # ## ### in English, # ## ## in French/,
  },
  {
    name: "fails when a code block differs in content",
    files: french(FRENCH.replace("# the tooling", "# l'outillage")),
    status: 1,
    says: /code block 1 \(bash\): the content differs from its line 1/,
  },
  {
    name: "fails when a code block differs in info string",
    files: french(FRENCH.replace("```bash", "```sh")),
    status: 1,
    says: /code block 1: info string "bash" in English, "sh" in French/,
  },
  {
    name: "fails when the code blocks differ in number",
    files: french(FRENCH.replace("```bash\nnpm ci   # the tooling\n```\n", "")),
    status: 1,
    says: /code blocks: 1 in English, 0 in French/,
  },
  {
    name: "fails when a table has not the same number of rows",
    files: french(FRENCH.replace("| a | 1 |", "| a | 1 |\n| b | 2 |")),
    status: 1,
    says: /table 1: 3 rows in English, 4 in French/,
  },
  {
    name: "fails when the French toc.yml drops a page the English one lists",
    files: { "docs/fr/toc.yml": TOC_FR.split("\n").slice(0, 2).join("\n") + "\n" },
    status: 1,
    says: /docs\/fr\/toc\.yml: entry 2 is \(none\), docs\/toc\.yml has docs\/adr\/0001-x\.md/,
  },
  {
    name: "fails when the two toc.yml list the same pages in another order",
    files: {
      "docs/toc.yml": TOC + "- name: Configuration\n  href: configuration.md\n",
      "docs/configuration.md": "# Configuration\n",
      "docs/fr/configuration.md": "# Configuration\n",
      "docs/fr/toc.yml": "- name: Configuration\n  href: configuration.md\n" + TOC_FR,
    },
    status: 1,
    says: /entry 1 is docs\/configuration\.md, docs\/toc\.yml has docs\/getting-started\.md/,
  },
];
