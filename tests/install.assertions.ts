// Checks on the archive's contents and on the lines the launchers and installers hold.
import { ok } from "node:assert";
import type { Mention } from "./install.fixtures.ts";

/** `text` holds every snippet of `mentions`; the message names what a missing one stands for. */
export function assertMentions(text: string, mentions: readonly Mention[]): void {
  for (const [snippet, what] of mentions) ok(text.includes(snippet), `${what}: not found: ${snippet}`);
}

/** Every path starts with `root`. */
export function assertAllUnder(paths: readonly string[], root: string): void {
  for (const path of paths) ok(path.startsWith(root), `${path} is not under ${root}`);
}

/** `paths` holds each of `files`. */
export function assertHolds(paths: ReadonlySet<string>, files: readonly string[]): void {
  for (const file of files) ok(paths.has(file), `${file} missing`);
}

/** Each of `files` has a mode with an x in it. */
export function assertExecutable(modes: ReadonlyMap<string, string>, files: readonly string[]): void {
  for (const file of files) ok(modes.get(file)?.includes("x"), `${file}: ${modes.get(file)}`);
}
