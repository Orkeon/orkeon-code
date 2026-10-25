// The run runDevLearn decides in: the repository of run-dev-learn.fixtures.ts with a remote, two motifs of the
// Test axis the model keeps, and an inline HumanInput stub recording each multi-select it is asked.
import type { HumanInput } from "../../../shared/application/ports.ts";
import { motifId } from "../../../shared/domain/dev/learn-proposals.ts";
import { OUT, T, motif, setup } from "./run-dev-learn.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export { OUT, REFUSED, T } from "./run-dev-learn.fixtures.ts";

export const STATE = `${WORKSPACE}/.orkeon/dev-learn-state.json`;
export const MEMORY_DIR_REFUSED = `${WORKSPACE}/docs/memory/refused.md`;
export const ROWS_A = [T.ledger1, T.ledger3, T.invoices];
export const ROWS_B = [T.exports, T.invoices, T.ledger3];
export const ID_A = motifId("Test", ROWS_A);
export const ID_B = motifId("Test", ROWS_B);
export const OUT_FILES = [`${OUT}/proposals.json`, `${OUT}/PROPOSALS.md`];

export interface Asked { prompt: string; options: readonly string[] }
export type MultiAnswer = { answered: true; values: string[] } | { answered: false };

/** A HumanInput whose multi-select answers `pick` of the options, each question recorded in `asked`. */
export function stub(pick: (options: readonly string[]) => MultiAnswer): { human: Pick<HumanInput, "multi">; asked: Asked[] } {
  const asked: Asked[] = [];
  return {
    asked,
    human: { multi: async (prompt, options) => { asked.push({ prompt, options }); return pick(options); } },
  };
}

/** Selects the motif A option only. */
export const pickA = (options: readonly string[]): MultiAnswer => ({ answered: true, values: options.filter((o) => o.startsWith(ID_A)) });

export interface DecideSetup {
  human?: Pick<HumanInput, "multi">;
  /** The memory.dir of .orkeon/config.json. */
  memoryDir?: string;
  /** The refused.md already under docs/memory/. */
  memoryDirRefused?: string;
  /** The model keeps no motif. */
  noMotif?: boolean;
}

/** The repository, the model keeping motif A (refusal tests) and motif B (empty exports), the human port given. */
export function decideSetup(over: DecideSetup = {}) {
  const f = setup();
  f.shell.results["git remote get-url origin"] = { stdout: "git@github.com:acme/ledger.git\n" };
  f.llm.extractions = over.noMotif ? [{ motifs: [] }] : [{
    motifs: [motif({ rows: ROWS_A }), motif({ title: "Exports skip the empty case", topic: "empty-exports", rows: ROWS_B, key_term: "empty" })],
  }];
  if (over.memoryDir !== undefined) f.files.files.set(`${WORKSPACE}/.orkeon/config.json`, JSON.stringify({ "memory.dir": over.memoryDir }));
  if (over.memoryDirRefused !== undefined) f.files.files.set(MEMORY_DIR_REFUSED, over.memoryDirRefused);
  return { files: f.files, deps: { ...f.deps, human: over.human } };
}

/** The options of the axis Test question, motif A then motif B. */
export const OPTIONS = [
  `${ID_A} — Refusal paths go untested (3 batches, new, CONTRIBUTING.md)`,
  `${ID_B} — Exports skip the empty case (3 batches, new, CONTRIBUTING.md)`,
];

/** The end of a run that decided nothing: the --accept hint. */
export const ACCEPT_HINT_END = `→ /dev-learn --accept ${ID_A},${ID_B}\n` +
  "  or /dev-learn --refuse <id> for each one you reject — read the lines first in PROPOSALS.md";
