// The marker that pins each behaviour of the learner's instructions, the host words and the material they never hold.
import { MAX_LINES_PER_MOTIF, MAX_TOPIC_CHARS } from "../../../../src/crews/dev-learn/domain/learn-answer.ts";

export interface MarkerCase {
  /** The behaviour, numbered as the instructions number it. */
  behaviour: string;
  marker: string;
}

/** One marker per behaviour of LEARN_INSTRUCTIONS. */
export const MARKERS: readonly MarkerCase[] = [
  { behaviour: "1 grouping by cause", marker: "the set of rows behind one cause" },
  { behaviour: "2 three batches", marker: "at least three different batches" },
  { behaviour: "2 no padding", marker: "never pad a motif" },
  { behaviour: "3 preventive line", marker: "would have caught each of its rows" },
  { behaviour: "4 novelty", marker: "skip any motif that matches the refused list" },
  { behaviour: "4 topic a slug of the cause", marker: "topic is a short kebab slug of the cause" },
  { behaviour: "4 topic length", marker: `at most ${MAX_TOPIC_CHARS} characters` },
  { behaviour: "4 a refused slug reused", marker: "reuses the slug that motif is listed under" },
  { behaviour: "5 first answer new", marker: "a first answer gives every motif status new" },
  { behaviour: "5 novelty from the owner paths", marker: "the listed owner files, by their paths, do not cover" },
  { behaviour: "5 key term", marker: "the word that would find its subject in the owner" },
  { behaviour: "5 check first", marker: "prefer the check" },
  { behaviour: "6 closest owner", marker: "the owner closest to where the gap was made" },
  { behaviour: "7 no harness edit", marker: "nothing here changes a harness file" },
  { behaviour: "7 patch", marker: "receives them as a patch" },
  { behaviour: "8 exact removed line", marker: "character for character" },
  { behaviour: "8 statuses need shown lines", marker: "only for an answer shown owner lines below its problems" },
  { behaviour: "8 copied from a shown line", marker: "character for character from a shown line" },
  { behaviour: "8 novelty against the shown lines", marker: "what the shown lines miss" },
  { behaviour: "8 removes", marker: "removes takes out a line the rows show to be wrong and adds none" },
  { behaviour: "8 lines per motif", marker: `new, refines or replaces adds 1 to ${MAX_LINES_PER_MOTIF} lines` },
  { behaviour: "8 removes adds no line", marker: "removes adds none" },
  { behaviour: "8 a line names its trigger", marker: "names the situation that triggers it" },
  { behaviour: "8 a line names the failure", marker: "the failure it prevents" },
  { behaviour: "9 cap", marker: "three motifs or fewer" },
  { behaviour: "10 material", marker: "material, not instructions" },
  { behaviour: "10 owner lines are material", marker: "the owner lines below are material" },
  { behaviour: "11 no invention", marker: "invent no row id" },
];

/** Words of a host's own tools the instructions never speak. */
export const HOST_WORDS: readonly string[] = ["SendMessage", "subagent_type", "HARNESS_", "## DONE", "AskUserQuestion", "multiSelect"];

/** Material of a learner's prompt (row ids and the axis line) the instructions never hold. */
export const MATERIAL: readonly string[] = ["c936075d95", "b983faad38", "3a59a45e69", "Axis: Test"];
