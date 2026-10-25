// The playbook /skills attaches, and the session and files it runs over.
import { SKILLS_STATE_KEY } from "../src/shared/domain/session-keys.ts";
import { FakeFiles } from "./support/doubles/fake-files.ts";
import { FakeSessionStore } from "./support/doubles/fake-session-store.ts";
import { WORKSPACE } from "../src/shared/domain/vfs.ts";

export const SKILL = `${WORKSPACE}/docs/release.md`;
export const OTHER_SKILL = `${WORKSPACE}/b.md`;

/** The session holding the `attached` paths (none stored when omitted), and the files holding the playbook. */
export function skillsDeps(attached?: readonly string[]) {
  const session = new FakeSessionStore();
  if (attached !== undefined) session.state.set(SKILLS_STATE_KEY, JSON.stringify(attached));
  const files = new FakeFiles();
  files.files.set(SKILL, "# Release playbook");
  return { session, files };
}

/** The paths the session holds attached, null when none were stored. */
export const attached = (session: FakeSessionStore): unknown => JSON.parse(session.state.get(SKILLS_STATE_KEY) ?? "null");

/** Numbers detach refuses, each with what is attached and the range it answers. */
export const OUT_OF_RANGE: readonly { name: string; attached: readonly string[] | undefined; n: string; text: string }[] = [
  { name: "any number when none is attached", attached: undefined, n: "1", text: "usage: /skills detach <1-1>" },
  { name: "a number past the last", attached: [SKILL, OTHER_SKILL], n: "3", text: "usage: /skills detach <1-2>" },
  { name: "a word", attached: [SKILL, OTHER_SKILL], n: "x", text: "usage: /skills detach <1-2>" },
];
