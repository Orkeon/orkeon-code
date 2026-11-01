// The instruction files /init finds already in the project: how much of each the model sees, the marker of a
// cut, and where the new file goes when one was cut. Pure, no IO.

import type { InstructionsFile } from "../../../shared/domain/instructions-file.ts";
import { INSTRUCTIONS_FILE_WRITTEN } from "../../../shared/domain/instructions-file.ts";

/** Characters of each existing instruction file the model sees. */
export const MAX_EXISTING_FILE_CHARS = 40_000;

/** Characters of all the existing instruction files together: the later files are cut to what is left. */
export const MAX_EXISTING_FILES_CHARS = 120_000;

/** The file /init writes instead of INSTRUCTIONS_FILE_WRITTEN when the model saw an existing file cut. */
export const PROPOSED_FILE = "AGENTS.proposed.md";

/** An existing instruction file as the model sees it; `cut`, when set, the characters left out of its end. */
export interface ExistingFile extends InstructionsFile {
  cut?: number;
}

/** `content` of `file` kept whole up to `max` characters, else its start and the count left out. */
export function clipExisting(file: string, content: string, max = MAX_EXISTING_FILE_CHARS): ExistingFile {
  if (content.length <= max) return { file, content };
  return { file, content: content.slice(0, max), cut: content.length - max };
}

/** `found`, in its order, each file whole up to `perFile` characters and all of them up to `total`: a file past
 *  either bound is cut to what is left, nothing of it shown once the total is spent. */
export function clipExistingFiles(
  found: readonly InstructionsFile[],
  perFile = MAX_EXISTING_FILE_CHARS,
  total = MAX_EXISTING_FILES_CHARS,
): ExistingFile[] {
  let left = total;
  return found.map((f) => {
    const clipped = clipExisting(f.file, f.content, Math.min(perFile, left));
    left -= clipped.content.length;
    return clipped;
  });
}

/** The existing files the model saw cut. */
export function cutFiles(existing: readonly ExistingFile[]): ExistingFile[] {
  return existing.filter((f) => (f.cut ?? 0) > 0);
}

/** The file to write: INSTRUCTIONS_FILE_WRITTEN, or PROPOSED_FILE when an existing file was cut, since a
 *  file written from part of one would lose the rest of it. */
export function instructionsTarget(existing: readonly ExistingFile[]): string {
  return cutFiles(existing).length > 0 ? PROPOSED_FILE : INSTRUCTIONS_FILE_WRITTEN;
}

/** What the outcome adds when the file went to PROPOSED_FILE: INSTRUCTIONS_FILE_WRITTEN left as it is (or
 *  not written, when the project has none), which file was cut and what is left to do; "" when nothing was cut. */
export function proposalNote(existing: readonly ExistingFile[]): string {
  const cut = cutFiles(existing).map((f) => f.file);
  if (cut.length === 0) return "";
  const [verb, whose] = cut.length > 1 ? ["are", "their"] : ["is", "its"];
  const kept = existing.some((f) => f.file === INSTRUCTIONS_FILE_WRITTEN) ? "left as it is" : "not written";
  return `; ${INSTRUCTIONS_FILE_WRITTEN} ${kept}, since ${cut.join(", ")} ${verb} cut (${MAX_EXISTING_FILE_CHARS} ` +
    `characters shown of a file, ${MAX_EXISTING_FILES_CHARS} in all) and the model saw only ${whose} start: review ` +
    `${PROPOSED_FILE} and merge it by hand`;
}
