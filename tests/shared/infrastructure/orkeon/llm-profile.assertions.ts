// Checks on what profiledAgent built over the recording factories.
import { deepStrictEqual, strictEqual } from "node:assert";
import type { RecordingAgentBuilder } from "./llm-profile.fixtures.ts";

/** `builder` is the one builder the factories made, configured on `profiles` (none: the host's default model). */
export function assertBuiltOn(host: { built: RecordingAgentBuilder[] }, builder: unknown, profiles: string[]): void {
  deepStrictEqual(host.built.length, 1, "the factories built " + host.built.length + " agents, one was expected");
  strictEqual(builder, host.built[0], "profiledAgent did not return the builder the factories made");
  deepStrictEqual(host.built[0].configs.map((config) => config.profile), profiles, "the builder is not on the expected profiles");
}
