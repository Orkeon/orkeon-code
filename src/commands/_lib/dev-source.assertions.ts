// Checks on the /dev-spec and /dev-change command sources.
import { ok, strictEqual } from "node:assert";

/** The command source of `step` starts the dev step and launches its own crew, one at a time, never main-loop. */
export function assertLaunchesOwnCrew(src: string, step: string): void {
  ok(src.includes(`startDevStep("${step}"`), `/${step} does not start the dev step ${step}`);
  ok(new RegExp(`launchCrew\\([\\s\\S]*"${step}"`).test(src), `/${step} does not launch the ${step} crew`);
  strictEqual(src.includes("main-loop"), false, `/${step} names main-loop`);
  ok(src.includes("maxConcurrent: 1"), `/${step} does not run one crew at a time`);
}
