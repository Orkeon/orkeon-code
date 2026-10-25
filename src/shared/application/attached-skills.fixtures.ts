// The session and files the attached /skills are read from.
import { SKILLS_STATE_KEY } from "../domain/session-keys.ts";
import { FakeFiles } from "../../../tests/support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../tests/support/doubles/fake-session-store.ts";

/** A session holding `registry` as the skills registry (none when null), and empty files. */
export function skillsHarness(registry: string | null) {
  const session = new FakeSessionStore();
  if (registry !== null) session.state.set(SKILLS_STATE_KEY, registry);
  return { session, files: new FakeFiles() };
}
