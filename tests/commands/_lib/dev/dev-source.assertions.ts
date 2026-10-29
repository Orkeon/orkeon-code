// Checks on the /dev-spec command source.
import { ok, strictEqual } from "node:assert";

/** The command source launches the crew its parse names, through the dev step, one at a time, never main-loop. */
export function assertLaunchesParsedCrew(src: string): void {
  ok(src.includes("const crew = parsed.crew;"), "/dev-spec does not take the crew from its parse");
  ok(src.includes("startDevStep(crew,"), "/dev-spec does not start the dev step of the parsed crew");
  ok(/launchCrew\([\s\S]*?, crew,/.test(src), "/dev-spec does not launch the parsed crew");
  strictEqual(src.includes("main-loop"), false, "/dev-spec names main-loop");
  ok(src.includes("maxConcurrent: 1"), "/dev-spec does not run one crew at a time");
}
