// The model of one /dev-learn run: what the crew proposes per axis, kept in
// `<work>/learn-<date>/proposals.json` for --accept and --refuse to read, and the lines
// those print. A decision applies nothing: it prints the change to make. Pure, no IO.
import { sha1Hex } from "../sha1.ts";

export const LEARN_FOLDER_PATTERN: RegExp = /^learn-\d{4}-\d{2}-\d{2}$/;
export function learnFolderName(date: string): string {
  return `learn-${date}`;
}
export const PROPOSALS_JSON = "proposals.json";
export const PROPOSALS_MD = "PROPOSALS.md";

export type OwnerKind = "repository" | "harness";
export type CheckKind = "test" | "analyzer" | "architecture-test" | "gate" | "rule";
export type MotifStatus = "new" | "refines" | "replaces";
export interface Motif {
  id: string;                 // motifId(axis, rows): 8 hex digits; 10 for both on a collision in one file (L3-Q09)
  title: string; topic: string; rows: string[]; batches: string[];
  preventiveLine: string; owner: { kind: OwnerKind; path: string };
  check: CheckKind; status: MotifStatus;
  linesRemoved: string[]; linesAdded: string[];
  novelty: string; keyTerm: string;
  /** What code found in the owner file (§ 2.4). */
  reconcile: string;
}
export interface DroppedMotif { title: string; filter: "recurrence" | "prevention" | "novelty"; reason: string }
export interface AxisProposal {
  axis: string; batches: number; gaps: number;
  shownRows: string[];        // the row ids handed to the model, in order
  hiddenRows: number;         // rows over the cap, not shown
  outcome: "proposed" | "no-motif" | "no-proposal" | "unchanged";
  reason?: string;            // no-proposal: the first problem; unchanged: the earlier folder
  motifs: Motif[]; dropped: DroppedMotif[];
}
export interface ProposalsFile {
  version: 1; date: string; work: string;
  read: { files: number; gaps: number; batches: number; treatedOrkeon: number; treatedHarness: number; refused: number };
  axes: AxisProposal[];
}

export function motifId(axis: string, rows: readonly string[]): string {
  return sha1Hex(`${axis}|${[...rows].sort().join(",")}`).slice(0, 8);
}

// ---- parsing: every field is checked, the first wrong one is named ----

type Obj = Record<string, unknown>;
class Shape extends Error {}
const fieldPath = (at: string, key: string): string => (at === "" ? key : `${at}.${key}`);

const OWNER_KINDS: readonly string[] = ["repository", "harness"];
const CHECK_KINDS: readonly string[] = ["test", "analyzer", "architecture-test", "gate", "rule"];
const STATUSES: readonly string[] = ["new", "refines", "replaces"];
const FILTERS: readonly string[] = ["recurrence", "prevention", "novelty"];
const OUTCOMES: readonly string[] = ["proposed", "no-motif", "no-proposal", "unchanged"];
const MOTIF_ID = /^[0-9a-f]{8}([0-9a-f]{2})?$/;
const READ_KEYS = ["files", "gaps", "batches", "treatedOrkeon", "treatedHarness", "refused"] as const;

function obj(v: unknown, at: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Shape(at);
  return v as Obj;
}
function str(o: Obj, key: string, at: string): string {
  const v = o[key];
  if (typeof v !== "string") throw new Shape(fieldPath(at, key));
  return v;
}
function count(o: Obj, key: string, at: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Shape(fieldPath(at, key));
  return v;
}
function strings(o: Obj, key: string, at: string): string[] {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Shape(fieldPath(at, key));
  return [...v];
}
function oneOf<T extends string>(o: Obj, key: string, values: readonly string[], at: string): T {
  const v = str(o, key, at);
  if (!values.includes(v)) throw new Shape(fieldPath(at, key));
  return v as T;
}
function list<T>(o: Obj, key: string, at: string, item: (v: unknown, at: string) => T): T[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Shape(fieldPath(at, key));
  return v.map((x, i) => item(x, `${fieldPath(at, key)}[${i}]`));
}

function motifOf(v: unknown, at: string): Motif {
  const o = obj(v, at);
  const id = str(o, "id", at);
  if (!MOTIF_ID.test(id)) throw new Shape(`${at}.id`);
  const owner = obj(o.owner, `${at}.owner`);
  return {
    id, title: str(o, "title", at), topic: str(o, "topic", at),
    rows: strings(o, "rows", at), batches: strings(o, "batches", at),
    preventiveLine: str(o, "preventiveLine", at),
    owner: { kind: oneOf<OwnerKind>(owner, "kind", OWNER_KINDS, `${at}.owner`), path: str(owner, "path", `${at}.owner`) },
    check: oneOf<CheckKind>(o, "check", CHECK_KINDS, at), status: oneOf<MotifStatus>(o, "status", STATUSES, at),
    linesRemoved: strings(o, "linesRemoved", at), linesAdded: strings(o, "linesAdded", at),
    novelty: str(o, "novelty", at), keyTerm: str(o, "keyTerm", at), reconcile: str(o, "reconcile", at),
  };
}

function droppedOf(v: unknown, at: string): DroppedMotif {
  const o = obj(v, at);
  return { title: str(o, "title", at), filter: oneOf<DroppedMotif["filter"]>(o, "filter", FILTERS, at), reason: str(o, "reason", at) };
}

function axisOf(v: unknown, at: string): AxisProposal {
  const o = obj(v, at);
  const axis: AxisProposal = {
    axis: str(o, "axis", at), batches: count(o, "batches", at), gaps: count(o, "gaps", at),
    shownRows: strings(o, "shownRows", at), hiddenRows: count(o, "hiddenRows", at),
    outcome: oneOf<AxisProposal["outcome"]>(o, "outcome", OUTCOMES, at),
    motifs: list(o, "motifs", at, motifOf), dropped: list(o, "dropped", at, droppedOf),
  };
  if (o.reason !== undefined) axis.reason = str(o, "reason", at);
  return axis;
}

export function parseProposalsFile(text: string): { ok: true; file: ProposalsFile } | { ok: false; problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, problem: `not JSON (${(e instanceof Error ? e.message : String(e)).split("\n")[0]})` };
  }
  try {
    const o = obj(raw, "the top level");
    if (o.version !== 1) throw new Shape("version");
    const read = obj(o.read, "read");
    const counts = Object.fromEntries(READ_KEYS.map((k) => [k, count(read, k, "read")])) as ProposalsFile["read"];
    const file: ProposalsFile = {
      version: 1, date: str(o, "date", ""), work: str(o, "work", ""),
      read: counts, axes: list(o, "axes", "", axisOf),
    };
    return { ok: true, file };
  } catch (e) {
    if (e instanceof Shape) return { ok: false, problem: `${e.message} has the wrong shape` };
    throw e;
  }
}

export function serializeProposalsFile(file: ProposalsFile): string {
  return JSON.stringify(file, null, 1) + "\n";
}

// ---- the lines a decision prints ----

const HARNESS_SOURCE = /^\.devcontainer\/harness\/packs\/[^/]+\/claude\/(.+)$/;

/** The harness owner's file in the orkeon-workshop repository → its deployed copy in the checkout, or null. */
export function deployedHarnessPath(path: string): string | null {
  const m = HARNESS_SOURCE.exec(path);
  if (!m || m[1].split("/").some((s) => s === "" || s === "." || s === "..")) return null;
  return `.claude/${m[1]}`;
}

export function patchLines(motif: Motif): string[] {
  return [
    `file: ${motif.owner.path}`,
    ...motif.linesRemoved.map((l) => `- ${l}`),
    ...motif.linesAdded.map((l) => `+ ${l}`),
  ];
}

/** The lines printed for a motif: the patch for a harness owner, the change to make for a repository owner. */
export function acceptLines(motif: Motif): string[] {
  const head = motif.owner.kind === "harness"
    ? `accepted ${motif.id} — ${motif.title}: a harness file is never edited here; apply this in the orkeon-workshop repository:`
    : `accepted ${motif.id} — ${motif.title}: ${motif.owner.path} is not edited by /dev-learn; make the change in a batch (/dev-change, or by hand):`;
  return [head, ...patchLines(motif).map((l) => `  ${l}`)];
}
