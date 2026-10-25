// Data of the contract tests: steps whose anchors the tests set, and the texts a brief carries.
import type { CarriedText } from "../../../shared/domain/dev/carried-text.ts";
import { CARRIED_CONTRACT_CHARS } from "./contracts.ts";
import type { ImplementStep } from "./step-section.ts";

/** `step` with one test file and one production file, both to create in the sheet. */
export function stepCreating(step: ImplementStep, test: string, production: string): ImplementStep {
  return {
    ...step,
    anchor: { testFiles: [{ path: test, state: "to create" }], doubles: "", production: [{ path: production, state: "to create" }] },
  };
}

/** The stub a RED wrote in `src/prune.ts`, carried whole. */
export const STUB_CARRIED: readonly CarriedText[] = [
  { title: "src/prune.ts", path: "src/prune.ts", text: "export function prune(): never {\n  throw new Error(\"not implemented\");\n}\n" },
];

/** A text of `path` twice the room a contract carries: cut, never whole. */
export function pastTheRoom(path: string): CarriedText[] {
  return [{ title: path, path, text: "x".repeat(CARRIED_CONTRACT_CHARS * 2) }];
}
