// Parity of the gate with the harness's: on each scenario of tests/fixtures/dev/verify,
// runGate over the recorded git outputs prints the very lines the harness gate printed.
//   node --test src/crews/dev-verify/application/gate-parity.test.ts
//
// Recorded 2026-10-22 (git 2.39.5, GNU bash), again the same day once the trait ERE took its `-e`
// and the untracked-build-output and named-outside-roots scenarios were added; per scenario of scenarios.json:
//   T=$(mktemp -d <scratch>/top-<name>-XXXX); cd "$T"; git init -q
//   cp -r tests/fixtures/dev/verify/base/. "$T"
//   git add -A && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm base
//   cp -r tests/fixtures/dev/verify/batch/. "$T"; then the scenario's edits (first occurrence of `find`, or `create`)
//   bash /workspace/temp/_sources/orkeon-workshop/.devcontainer/harness/packs/dev/claude/skills/dev-verify/scripts/audit-capture.sh \
//     F1 workbench/vdemo/VDEMO-PLAN-F1.md <scratch>/cap-<name>.txt --roots "src tests" --trait BR --build-outputs "bin obj"
// harness-gate.txt keeps its stdout from `GATE — batch F1 — sheet` through `GATE — batch F1:`, "$T" replaced by
// /workspace. git-outputs.json holds the stdout and exit code of each command runGate issued, run with
// `bash -c "<command>"` in "$T", with the pack of pack.yaml (the same roots, trait and build outputs).
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { runGate } from "./run-gate.ts";

const FIXTURE = new URL("../../../../tests/fixtures/dev/verify/", import.meta.url).pathname;
const read = (name: string): string => readFileSync(join(FIXTURE, name), "utf8");

interface Edit { path: string; find?: string; replace?: string; create?: string }
const scenarios: Array<{ name: string; edits: Edit[] }> = JSON.parse(read("scenarios.json"));
const gitOutputs: Record<string, Record<string, { stdout: string; exitCode: number }>> = JSON.parse(read("git-outputs.json"));
const parsedPack = parseRepoPack(read("pack.yaml"));
if (!parsedPack.ok) throw new Error(`pack.yaml: ${parsedPack.error.message}`);
const pack = parsedPack.pack;

function harnessBlocks(): Map<string, string[]> {
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

function filesOf(edits: readonly Edit[]): FakeFiles {
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
    fake.files.set(`/workspace/${path}`, content);
    const slash = path.lastIndexOf("/");
    const dir = `/workspace/${path.slice(0, slash)}`;
    listings.set(dir, [...(listings.get(dir) ?? []), path.slice(slash + 1)]);
  }
  fake.listings = listings;
  return fake;
}

const blocks = harnessBlocks();

describe("gate parity with the harness", () => {
  it("covers every scenario in both recordings", () => {
    deepStrictEqual([...blocks.keys()], scenarios.map((s) => s.name));
    deepStrictEqual(Object.keys(gitOutputs), scenarios.map((s) => s.name));
  });
  for (const scenario of scenarios) {
    it(`prints the harness's lines on ${scenario.name}`, async () => {
      const files = filesOf(scenario.edits);
      const shell = new FakeShell();
      const recorded = gitOutputs[scenario.name];
      for (const [command, result] of Object.entries(recorded)) shell.results[command] = result;
      const out = await runGate({ files, shell }, {
        batch: "F1", code: "vdemo", prefix: "VDEMO", workShown: "workbench", planDirShown: "workbench/vdemo",
        sheetShown: "workbench/vdemo/VDEMO-PLAN-F1.md", pack, packShown: ".orkeon/repo.yaml",
      });
      if (!out.ok) throw new Error(out.error);
      deepStrictEqual(shell.commands, Object.keys(recorded));
      deepStrictEqual(out.run.report.lines, blocks.get(scenario.name));
      deepStrictEqual(files.writes, []);
    });
  }
});
