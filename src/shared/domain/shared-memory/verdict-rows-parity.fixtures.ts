// The recorded run of the harness's learning script, read from tests/fixtures/dev/learn.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEARN_FILE } from "./verdict-rows.ts";
import type { LearnRow, VerdictSource } from "./verdict-rows.ts";

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const work = join(root, "workbench");

/** A file the script's run recorded, as text. */
export const recorded = (name: string): string => readFileSync(join(root, name), "utf8");

/** The verdict files of every work folder of the fixture's workbench. */
export function sources(): VerdictSource[] {
  const out: VerdictSource[] = [];
  for (const code of readdirSync(work)) {
    if (code.startsWith(".") || !statSync(join(work, code)).isDirectory()) continue;
    for (const name of readdirSync(join(work, code))) {
      if (LEARN_FILE.test(name)) out.push({ code, name, text: readFileSync(join(work, code, name), "utf8") });
    }
  }
  return out;
}

/** The ids the recorded harness state marks treated. */
export const treatedIds = (): Set<string> =>
  new Set<string>((JSON.parse(recorded("harness-state.json")) as { treated: string[] }).treated);

/** The fields of a row the script prints. */
export const project = (r: LearnRow) =>
  ({ id: r.id, batch: r.batch, severity: r.severity, axis: r.axis, gap: r.gap, evidence: r.evidence, fix: r.fix });

/** The axes the script's run listed. */
export const AXES: readonly string[] = ["Test", "Placement"];
