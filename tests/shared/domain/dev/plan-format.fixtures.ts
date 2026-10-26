// The demo work folder the plan parsers are tested over, and the sheets written inline.
import { readFileSync } from "node:fs";

/** A file of the demo work folder. */
export const demoFile = (name: string): string =>
  readFileSync(new URL(`../../../fixtures/dev/workbench/demo/${name}`, import.meta.url), "utf8");

/** An Assumptions table, then an older list line, then a Decisions table whose row is no assumption. */
export const ASSUMPTIONS_SHEET =
  "## Assumptions\n| # | Assumption | To be validated by |\n|---|---|---|\n| H1 | mean is exported | its red test |\n"
  + "- H2 — a named export — to be validated by the user\n\n## Decisions\n| H9 | not one | x |\n";

/** An Assumptions table without a row. */
export const EMPTY_ASSUMPTIONS_SHEET = "## Assumptions\n| # | Assumption | To be validated by |\n|---|---|---|\n";
