// The text of the blocks a dev brief carries: the cut and left-out notes, the list of the project's files.

/** The line a cut block ends with. */
export const cutLine = (left: number): string => `… (cut: ${left} more characters)`;
export const notCarried = (titles: string): string => `Not carried (no room left): ${titles}.`;

export const PROJECT_FILES_HEADING = "Project files (tracked and untracked, the work folder and .orkeon/ left out):";

/** The closing line of a whole list. */
export const PROJECT_FILES_WHOLE_LINE = "- (the list is whole: a name absent from it does not exist)";

/** What a reader makes of the list, said only to an agent whose brief carries it: the closing line decides. */
export const PROJECT_LIST_RULE =
  "When the brief lists the project's files, its last line says whether the list is whole: when it is, a name absent " +
  "from it does not exist; past a cut, glob with a pattern decides. Never open a name you guessed, nor a folder.";

/** The closing line of a list cut at its bound, `left` files left out. */
export function projectFilesCutLine(left: number): string {
  return `- … and ${left} more: a name absent above may still exist; glob with a pattern lists them`;
}
