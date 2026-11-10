// The text the operator reads from project-init's domain: the note of an instructions file proposed apart.

/** What happened to the instructions file when the new one went apart. */
export const LEFT_AS_IT_IS = "left as it is";

/** The note added to the outcome when the file went to the proposed file, since an existing file was cut. */
export function proposalNoteText(n: {
  written: string; kept: string; cut: string; verb: string; whose: string; maxFile: number; maxAll: number; proposed: string;
}): string {
  return `; ${n.written} ${n.kept}, since ${n.cut} ${n.verb} cut (${n.maxFile} ` +
    `characters shown of a file, ${n.maxAll} in all) and the model saw only ${n.whose} start: review ` +
    `${n.proposed} and merge it by hand`;
}
