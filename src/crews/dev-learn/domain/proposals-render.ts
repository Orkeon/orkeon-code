// PROPOSALS.md, rendered by code from the run's ProposalsFile: a head line, one section
// per axis (a table of the motifs kept, what was dropped, then one block per motif with
// its lines), and the commands that decide. The file is read by people; proposals.json
// beside it is the source the decisions read. Pure, no IO.
import type { AxisProposal, Motif, ProposalsFile } from "../../../shared/domain/dev/learn-proposals.ts";
import { MOTIF_TABLE_HEADER, NOTHING_TO_DECIDE, NO_MOTIF_KEPT, noProposal, notShown, proposalsHead, unchangedSince } from "./messages.ts";

const TITLE_CELL = 80;
const RECONCILE_CELL = 160;
const OWNER_CELL = 200;
/** The rows shown per axis (MAX_ROWS_PER_AXIS of run-dev-learn.ts), named in the "Not shown" line. */
const ROWS_CAP = 40;
const FENCE = "```";

/** "|" → "/", line breaks → " · ", cut at max characters with "…". */
export function escapeCell(text: string, max: number): string {
  const flat = text.replace(/\r\n|\r|\n/g, " · ").replace(/\|/g, "/");
  const chars = Array.from(flat);
  return chars.length <= max ? flat : chars.slice(0, Math.max(0, max - 1)).join("") + "…";
}

function tableRow(m: Motif): string {
  const owner = `${m.owner.kind} \`${escapeCell(m.owner.path, OWNER_CELL)}\``;
  const cells = [
    m.id, escapeCell(m.title, TITLE_CELL), String(m.batches.length), m.status, owner, m.check,
    escapeCell(m.reconcile, RECONCILE_CELL),
  ];
  return `| ${cells.join(" | ")} |`;
}

function motifBlock(m: Motif): string[] {
  return [
    `### ${m.id} — ${m.title}`,
    "",
    `- Rows: ${m.rows.join(", ")} (batches ${m.batches.join(", ")})`,
    `- Preventive line: ${m.preventiveLine}`,
    `- Why new: ${m.novelty}`,
    "- Lines:",
    "",
    `${FENCE}diff`,
    `file: ${m.owner.path}`,
    ...m.linesRemoved.map((l) => `- ${l}`),
    ...m.linesAdded.map((l) => `+ ${l}`),
    FENCE,
  ];
}

function outcomeLine(a: AxisProposal): string {
  if (a.outcome === "no-motif") return NO_MOTIF_KEPT;
  if (a.outcome === "no-proposal") return noProposal(a.reason);
  return unchangedSince(a.reason);
}

function axisSection(a: AxisProposal): string[] {
  const out = [`## ${a.axis} — ${a.batches} batches, ${a.gaps} gaps`, ""];
  if (a.outcome === "proposed") {
    out.push(
      ...MOTIF_TABLE_HEADER,
      ...a.motifs.map(tableRow),
    );
  } else {
    out.push(outcomeLine(a));
  }
  const notes = [
    ...a.dropped.map((d) => `Dropped: ${d.title} — ${d.filter}: ${d.reason}`),
    ...(a.hiddenRows > 0 ? [notShown(a.hiddenRows, ROWS_CAP)] : []),
  ];
  if (notes.length > 0) out.push("", ...notes);
  if (a.outcome === "proposed") for (const m of a.motifs) out.push("", ...motifBlock(m));
  return out;
}

function decideSection(file: ProposalsFile): string[] {
  const ids = file.axes.flatMap((a) => (a.outcome === "proposed" ? a.motifs.map((m) => m.id) : []));
  if (ids.length === 0) return ["## Decide", "", NOTHING_TO_DECIDE];
  return [
    "## Decide", "",
    `${FENCE}text`,
    `/dev-learn --accept ${ids.join(",")}`,
    ...ids.map((id) => `/dev-learn --refuse ${id}`),
    FENCE,
  ];
}

export function renderProposals(file: ProposalsFile): string {
  const r = file.read;
  const lines = [
    `# Learn proposals — ${file.date}`,
    "",
    proposalsHead(file.work, r.gaps, r.batches, r.files, r.treatedOrkeon, r.treatedHarness, r.refused),
  ];
  for (const a of file.axes) lines.push("", ...axisSection(a));
  lines.push("", ...decideSection(file));
  return lines.join("\n") + "\n";
}
