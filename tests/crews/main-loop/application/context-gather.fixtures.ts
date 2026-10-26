// The files, stores and expected gauges the context-gathering tests read.
import type { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

/** A language store answering `value` for every key, from a file. */
export function languageStore(value: string | undefined) {
  return {
    readValue: async (key: string) => ({ key, value, source: "file" as const }),
  };
}

/** Stores no language is read from: none, one without a value, one that cannot be read. */
export const NO_LANGUAGE = [
  { name: "without a store", store: undefined },
  { name: "without a value", store: languageStore(undefined) },
  { name: "without a readable store", store: { readValue: async (): Promise<never> => { throw new Error("unreadable"); } } },
];

export interface InstructionsCase {
  /** What the workspace holds, as the test name says it. */
  name: string;
  /** Puts the workspace's instruction files in place. */
  arrange: (files: FakeFiles) => void;
}

/** Workspaces where CLAUDE.md is the instructions file: alone, or past a blank AGENTS.md. */
export const CLAUDE_MD_FALLBACKS: readonly InstructionsCase[] = [
  { name: "without AGENTS.md", arrange: (files) => { files.files.set(`${WORKSPACE}/CLAUDE.md`, "# Project\n"); } },
  {
    name: "past a blank AGENTS.md",
    arrange: (files) => {
      files.files.set(`${WORKSPACE}/CLAUDE.md`, "# Project\n");
      files.files.set(`${WORKSPACE}/AGENTS.md`, " \n");
    },
  },
];

/** Workspaces with no instructions file to read: none at all, or a blank CLAUDE.md. */
export const NO_INSTRUCTIONS: readonly InstructionsCase[] = [
  { name: "an absent file", arrange: () => {} },
  { name: "a blank file", arrange: (files) => { files.files.set(`${WORKSPACE}/CLAUDE.md`, " \n"); } },
];

/** The gauge read when every port fails or reports nothing. */
export const ZERO_GAUGE = { usedTokens: 0, contextWindow: 0, costUsd: 0, totalTokens: 0, totalCalls: 0 };
