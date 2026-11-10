// The reviewer's brief and answer prompt, assembled: the carried texts fitted to their room, what the brief says
// is in it, the project list, the reply cut to its end. The wording is in ./prompts.ts.

import { carry } from "./carried-text.ts";
import type { CarriedText } from "./carried-text.ts";
import { projectFileLines } from "./project-files.ts";
import { earlierTextCut, reviewAnswerPrompt, reviewBrief } from "./prompts.ts";
import type { ReviewMode } from "./prompts.ts";

export const MAX_REVIEW_REPLY_CHARS = 12_000;

/** The most carried text a review brief holds, in characters (MAX_BRIEF_CHARS less the brief's own lines). */
export const CARRIED_REVIEW_CHARS = 18_000;

export interface ReviewBriefInput {
  mode: ReviewMode;
  /** The folder under review, relative ("workbench/prune"). */
  folder: string;
  /** The files to review, relative, in reading order. */
  files: readonly string[];
  /** The spec or brief the work was planned from, relative; for a spec or a brief, its origin ("" when none). */
  source: string;
  /** The inventory text: the plan's I<n> refs, the path:line rows of a spec or a brief. */
  inventory: string;
  /** What a row may target. */
  targets: readonly string[];
  /** Texts carried in the brief, each under its title (next-batch: the batch's sheet, then what each closed batch
   *  changed), so the reviewer opens no file for them; the whole room of CARRIED_REVIEW_CHARS for them. */
  carried?: readonly CarriedText[];
  /** The project's files (tracked and untracked, the work folder left out), listed so that the reviewer guesses no
   *  name; absent or empty: no list. */
  projectFiles?: readonly string[];
}

export function buildReviewBrief(input: ReviewBriefInput): string {
  const { blocks, whole } = carry(input.carried ?? [], CARRIED_REVIEW_CHARS);
  return reviewBrief({
    mode: input.mode,
    folder: input.folder.endsWith("/") ? input.folder : `${input.folder}/`,
    files: input.files,
    filesInBrief: input.files.length > 0 && input.files.every((file) => whole.has(file)),
    source: input.source,
    sourceInBrief: whole.has(input.source),
    inventory: input.inventory.trimEnd(),
    blocks,
    project: projectFileLines(input.projectFiles ?? []),
    targets: input.targets,
  });
}

export function buildReviewAnswerPrompt(reply: string, problems: readonly string[], targets: readonly string[]): string {
  const text = reply.length > MAX_REVIEW_REPLY_CHARS ? earlierTextCut(reply.slice(-MAX_REVIEW_REPLY_CHARS)) : reply;
  return reviewAnswerPrompt(text, problems, targets);
}
