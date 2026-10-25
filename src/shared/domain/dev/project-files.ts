// The project's files as a brief lists them, so that a reader (the auditor, the next batch's reviewer) looks for
// what exists instead of guessing a module's name and reading it: a name absent from the list does not exist. The
// list is git's (tracked and untracked files alike, the ignored ones aside), the work folder and `.orkeon/` left
// out, bounded. Pure.

/** The most files a brief lists; past it the count left out is said, and glob lists the rest. */
export const MAX_LISTED_FILES = 150;

export const PROJECT_FILES_HEADING =
  "Project files (tracked and untracked, the work folder and .orkeon/ left out; a name absent here does not exist):";

/** git's listing (one path per line) as a sorted list without duplicates, the work folder and .orkeon/ left out. */
export function parseTrackedFiles(stdout: string, work: string): string[] {
  const folder = work.endsWith("/") ? work : `${work}/`;
  const files = stdout.split("\n").map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith(folder) && !line.startsWith(".orkeon/"));
  return [...new Set(files)].sort();
}

/** The lines a brief carries for `files`: none when no file is known, else the heading, one line per file up to
 *  `max`, and how many are left out. */
export function projectFileLines(files: readonly string[], max: number = MAX_LISTED_FILES): string[] {
  if (files.length === 0) return [];
  const shown = files.slice(0, max);
  const left = files.length - shown.length;
  return [
    PROJECT_FILES_HEADING,
    ...shown.map((file) => `- ${file}`),
    ...(left > 0 ? [`- … and ${left} more: glob lists the rest`] : []),
  ];
}
