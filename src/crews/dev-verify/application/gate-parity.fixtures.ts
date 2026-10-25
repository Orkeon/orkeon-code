// The recordings of tests/fixtures/dev/verify the gate parity is checked on: the scenarios, the git outputs runGate
// is served, the harness gate's lines per scenario, and the files of each scenario's tree.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { DevVerifyTarget } from "./run-gate.ts";
import { WORKSPACE } from "../../../shared/domain/dev/path-rebase.ts";

const FIXTURE = new URL("../../../../tests/fixtures/dev/verify/", import.meta.url).pathname;
const read = (name: string): string => readFileSync(join(FIXTURE, name), "utf8");

export interface Edit { path: string; find?: string; replace?: string; create?: string }
export interface Scenario { name: string; edits: Edit[] }
export interface RecordedOutput { stdout: string; exitCode: number }

export const scenarios: Scenario[] = JSON.parse(read("scenarios.json"));
export const gitOutputs: Record<string, Record<string, RecordedOutput>> = JSON.parse(read("git-outputs.json"));

function loadPack(): RepoPack {
  const parsedPack = parseRepoPack(read("pack.yaml"));
  if (!parsedPack.ok) throw new Error(`pack.yaml: ${parsedPack.error.message}`);
  return parsedPack.pack;
}

/** The pack of pack.yaml: the roots, trait and build outputs the recordings were made with. */
export const pack = loadPack();

/** Batch F1 of the plan folder workbench/vdemo, as the recordings ran it. */
export const TARGET: DevVerifyTarget = {
  batch: "F1", code: "vdemo", prefix: "VDEMO", workShown: "workbench", planDirShown: "workbench/vdemo",
  sheetShown: "workbench/vdemo/VDEMO-PLAN-F1.md", pack, packShown: ".orkeon/repo.yaml",
};

/** The lines the harness gate printed, per scenario name. */
export function harnessBlocks(): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of read("harness-gate.txt").split("\n")) {
    if (line.startsWith("=== ")) { current = []; blocks.set(line.slice(4), current); continue; }
    if (line !== "") current.push(line);
  }
  return blocks;
}

function tree(dir: string, rel = "", acc = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const r = rel === "" ? name : `${rel}/${name}`;
    if (statSync(p).isDirectory()) tree(p, r, acc);
    else acc.set(r, readFileSync(p, "utf8"));
  }
  return acc;
}

/** The base tree, the batch over it, then the scenario's edits, under /workspace with their listings. */
export function filesOf(edits: readonly Edit[]): FakeFiles {
  const files = new Map([...tree(join(FIXTURE, "base")), ...tree(join(FIXTURE, "batch"))]);
  for (const e of edits) {
    if (e.create !== undefined) { files.set(e.path, e.create); continue; }
    const text = files.get(e.path) ?? "";
    if (!text.includes(e.find ?? "")) throw new Error(`edit not applicable: ${e.path}`);
    files.set(e.path, text.replace(e.find ?? "", e.replace ?? ""));
  }
  const fake = new FakeFiles();
  const listings = new Map<string, string[]>();
  for (const [path, content] of files) {
    fake.files.set(`${WORKSPACE}/${path}`, content);
    const slash = path.lastIndexOf("/");
    const dir = `${WORKSPACE}/${path.slice(0, slash)}`;
    listings.set(dir, [...(listings.get(dir) ?? []), path.slice(slash + 1)]);
  }
  fake.listings = listings;
  return fake;
}
