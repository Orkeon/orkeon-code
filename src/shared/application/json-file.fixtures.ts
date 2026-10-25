// Paths and contents the hand-editable JSON file is read from.
import { WORKSPACE } from "../domain/vfs.ts";

export const PATH = `${WORKSPACE}/.orkeon/agents.json`;

/** A file content and the value it parses to, whatever its shape. */
export const PARSED_SHAPES: readonly { name: string; content: string; value: unknown }[] = [
  { name: "an object", content: `{"reviewer":{"role":"r","goal":"g"}}\n`, value: { reviewer: { role: "r", goal: "g" } } },
  { name: "an array", content: `["a"]`, value: ["a"] },
];

/** Read errors that mean the file is absent. */
export const ABSENT_MESSAGES: readonly string[] = ["No such file or directory", "path does not exist"];
