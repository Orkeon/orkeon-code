// The auditor's brief, follow-up and answer prompt, assembled: the sheet and the capture carried while they fit
// MAX_BRIEF_CHARS, the rows of the first answer fitted to the follow-up, the reply cut keeping its end. The wording
// is in ./prompts.ts.

import type { AuditAnswer, AuditRow } from "../domain/audit-answer.ts";
import { cut } from "../domain/text.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import { projectFileLines } from "../../../shared/domain/dev/project-files.ts";
import { earlierTextCut } from "../../../shared/domain/dev/prompts.ts";
import {
  NO_ROWS_LINE, THE_CAPTURE_FOLDER, auditAnswerPrompt, auditRowLine, auditScopeLines, captureFilesToReadLines,
  captureInBriefLines, captureLeftToReadLines, captureTextBlock, fastSuiteLines, firstAnswerLines, mechanicalTableLines,
  previousGapsLines, rowsLeftOutLine, sheetInBriefLines, undecidedLine, validationCommandLines, validationReportSection,
  validationReportsLines, validationsNamedLine,
} from "./prompts.ts";

/** One capture file and its text. */
export interface CaptureText {
  path: string;
  text: string;
}

/** The most capture text the brief carries; a file past it stays to read. */
export const INLINE_CAPTURE_CHARS = 12_000;

/** The most sheet text the brief carries; a longer sheet stays to read. */
export const INLINE_SHEET_CHARS = 6_000;
/** What the brief keeps free under MAX_BRIEF_CHARS once the capture is in. */
const BRIEF_MARGIN = 200;
/** The capture files the brief stands for once every other one is in it: the index, the manifest, the table. */
const CAPTURE_FRAME = /\/(?:index\.txt|manifest\.txt|table\.md)$/;

export interface AuditBriefInput {
  mode: "fast" | "full" | "resume";
  batch: string;
  sheetPath: string;
  /** The sheet's text, carried in the brief while it fits INLINE_SHEET_CHARS; absent or longer: read from sheetPath. */
  sheetText?: string;
  captureFiles: readonly string[];
  /** The project's files (tracked and untracked, the work folder left out), listed so that the auditor guesses no
   *  name; absent or empty: no list. */
  projectFiles?: readonly string[];
  /** The capture files' texts, table.md aside (the brief carries the table): each goes in the brief while it has
   *  room, the rest stay to read. Absent: every capture file is to read. */
  captureTexts?: readonly CaptureText[];
  table: string;
  appliedRules: string;
  commands: { testClass?: string; testProject?: string; testIntegration?: string };
  previousGaps: readonly AuditRow[] | null;
  /** Under full: the whole fast suite as code ran it, before the audit. */
  suite?: { command: string; outcome: string; tail: string };
  /** The "## Precedents" block the step recalled (T4: mistakes whose signal to check), "" or absent when none. */
  precedents?: string;
}

const scopeLines = (input: AuditBriefInput): string[] =>
  auditScopeLines(input.batch, input.mode, input.sheetPath, input.appliedRules);

function projectLines({ projectFiles }: AuditBriefInput): string[] {
  const lines = projectFileLines(projectFiles ?? []);
  return lines.length === 0 ? [] : ["", ...lines];
}

const suiteLines = ({ suite }: AuditBriefInput): string[] => (suite === undefined ? [] : fastSuiteLines(suite));

function previousLines(input: AuditBriefInput, line: (row: AuditRow) => string): string[] {
  if (input.mode !== "resume") return [];
  return previousGapsLines((input.previousGaps ?? []).map(line));
}

function precedentLines({ precedents }: AuditBriefInput): string[] {
  const block = (precedents ?? "").trimEnd();
  return block === "" ? [] : ["", block];
}

/** The capture as the brief carries it: each text while there is room, then the files left to read. */
function captureLines(input: AuditBriefInput, room: number): string[] {
  if (input.captureTexts === undefined) return captureFilesToReadLines(input.captureFiles);
  const blocks: string[] = [];
  const carried = new Set<string>();
  let left = Math.min(INLINE_CAPTURE_CHARS, room);
  for (const { path, text } of input.captureTexts) {
    const block = captureTextBlock(path.slice(path.lastIndexOf("/") + 1), text);
    if (block.length + 1 > left) continue;
    blocks.push(block);
    carried.add(path);
    left -= block.length + 1;
  }
  const toRead = input.captureFiles.filter((path) => !carried.has(path));
  const lines = blocks.length > 0 ? captureInBriefLines(blocks) : [];
  if (toRead.some((path) => !CAPTURE_FRAME.test(path))) {
    lines.push(...(lines.length > 0 ? [""] : []), ...captureLeftToReadLines(toRead));
  }
  return lines;
}

/** The sheet as the brief carries it, or nothing (left to read from its path). */
function sheetLines(input: AuditBriefInput, room: number): string[] {
  const text = input.sheetText?.trimEnd() ?? "";
  if (text === "" || text.length > Math.min(INLINE_SHEET_CHARS, room)) return [];
  return sheetInBriefLines(text);
}

export function buildAuditBrief(input: AuditBriefInput): string {
  const rest = [
    "",
    ...validationCommandLines(input.commands),
    ...suiteLines(input),
    ...previousLines(input, auditRowLine),
    ...precedentLines(input),
    ...mechanicalTableLines(input.table.trimEnd()),
  ];
  const head = [...scopeLines(input), ...projectLines(input)];
  const sheet = sheetLines(input, MAX_BRIEF_CHARS - BRIEF_MARGIN - [...head, "", ...rest].join("\n").length);
  const room = MAX_BRIEF_CHARS - BRIEF_MARGIN - [...head, "", ...sheet, ...rest].join("\n").length;
  return [...head, "", ...sheet, ...captureLines(input, room), ...rest].join("\n");
}

export interface ValidationReport {
  command: string;
  /** "exit 0", "exit 1", "timed out after 300 s", "refused: <reason>", "not run: <reason>". */
  outcome: string;
  /** At most 15 lines and 1 500 characters of the output, stderr after stdout. */
  tail: string;
}

/** The follow-up's caps: one row of the first answer, one report's tail, room kept for the closing lines. */
const FOLLOW_UP_ROW_CHARS = 240;
const FOLLOW_UP_TAIL_CHARS = 800;
const FOLLOW_UP_MARGIN = 200;

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : ".";
}

/** A report's output, cut to its last FOLLOW_UP_TAIL_CHARS characters. */
function cutTail(tail: string): string {
  const text = tail.trimEnd();
  return text.length > FOLLOW_UP_TAIL_CHARS ? `…${text.slice(1 - FOLLOW_UP_TAIL_CHARS)}` : text;
}

/**
 * The second brief: the first one without the capture index and the table (named by their
 * folder), the first answer with each row cut, and each report with its tail cut. Rows that
 * would take it past MAX_BRIEF_CHARS are left out and counted.
 */
export function buildValidationFollowUp(input: AuditBriefInput, first: AuditAnswer, reports: readonly ValidationReport[]): string {
  const capped = (row: AuditRow): string => cut(auditRowLine(row), FOLLOW_UP_ROW_CHARS);
  const folder = input.captureFiles.length > 0 ? folderOf(input.captureFiles[0]) : THE_CAPTURE_FOLDER;
  const head = [
    ...scopeLines(input),
    "",
    ...validationCommandLines(input.commands),
    ...suiteLines(input),
    ...previousLines(input, capped),
    ...firstAnswerLines(folder, first.verdict),
  ];
  const sections = reports.map((r) => validationReportSection(r.command, r.outcome, cutTail(r.tail)));
  const tail = [
    validationsNamedLine(first.validations.map((v) => cut(v, FOLLOW_UP_ROW_CHARS))),
    ...first.undecided.map((u) => cut(undecidedLine(u.check, u.reason), FOLLOW_UP_ROW_CHARS)),
    ...validationReportsLines(sections),
  ];
  let room = MAX_BRIEF_CHARS - FOLLOW_UP_MARGIN - head.join("\n").length - tail.join("\n").length;
  const rows: string[] = [];
  for (const [i, row] of first.rows.entries()) {
    const line = `  ${capped(row)}`;
    if (line.length + 1 > room) {
      rows.push(rowsLeftOutLine(first.rows.length - i));
      break;
    }
    rows.push(line);
    room -= line.length + 1;
  }
  if (first.rows.length === 0) rows.push(NO_ROWS_LINE);
  return [...head, ...rows, ...tail].join("\n");
}

const MAX_REPLY_CHARS_IN_ANSWER_PROMPT = 12_000;

export function buildAnswerPrompt(reply: string, problems: readonly string[]): string {
  const text = reply.length > MAX_REPLY_CHARS_IN_ANSWER_PROMPT
    ? earlierTextCut(reply.slice(-MAX_REPLY_CHARS_IN_ANSWER_PROMPT))
    : reply;
  return auditAnswerPrompt(text, problems);
}
