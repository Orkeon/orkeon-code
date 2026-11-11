// The playbook /skills attaches, and the session and files it runs over.
import { SKILLS_STATE_KEY } from "../../../../src/shared/domain/session-keys.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

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

/** skillsDeps with the settings and the decision model `/skills suggest` reads. */
export function suggestDeps() {
  const config = new FakeConfigStore();
  const decision = new FakeDecisionModel();
  return { ...skillsDeps(), config, decision };
}

export const SUGGEST_STATUS_OFF =
  "skills.suggest: off; skills read from .orkeon/skills/*.md and .claude/skills/*/SKILL.md; decision model: present.";
export const SUGGEST_ON = "skills.suggest: on for this session; /clear clears it.";
export const SUGGEST_ON_NO_MODEL =
  "skills.suggest: on for this session (the host has no decision model: none is suggested until it has one); /clear clears it.";
export const LAST_SUGGESTION = JSON.stringify({ offered: 3, picks: [{ path: SKILL, share: 0.8 }] });
