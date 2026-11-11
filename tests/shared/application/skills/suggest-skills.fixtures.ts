// The ports of shared/application/skills/suggest-skills.ts over fakes: a project with three skills.
import type { DecisionAnswers } from "../../../../src/shared/domain/decision/questions.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const REQUEST = "Cut the 2.1 release";
export const MIGRATION = "/workspace/.orkeon/skills/migration.md";
export const RELEASE = "/workspace/.orkeon/skills/release.md";
export const REVIEW = "/workspace/.claude/skills/review/SKILL.md";
export const RELEASE_TEXT = "# Release\nCut a release: changelog, tag, notes.\n\n## Steps\n1. Update the changelog.";

export function chose(choice: string, probabilities: Record<string, number>): DecisionAnswers {
  return { skill: { type: "choice", choice, confidence: probabilities[choice] ?? 0, probabilities } };
}

/** The ports with the suggestion on, a decision model that picks the release skill (s2, in listing order), and the
 *  three skills: migration and release in `.orkeon/skills`, review in `.claude/skills`. */
export function suggestSetup(setting: string | null = "on") {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["skills.suggest"] = setting;
  const decision = new FakeDecisionModel();
  decision.answers = chose("s2", { s1: 0.05, s2: 0.8, s3: 0.1, none: 0.05 });
  const files = new FakeFiles();
  files.listings.set("/workspace/.orkeon/skills", ["release.md", "migration.md", "notes.txt"]);
  files.listings.set("/workspace/.claude/skills", ["review", "README.md"]);
  files.files.set(MIGRATION, "# Migration\nWrite and roll back a schema migration.");
  files.files.set(RELEASE, RELEASE_TEXT);
  files.files.set(REVIEW, "---\nname: review\ndescription: Review a change\n---\nRead the diff first.");
  const session = new FakeSessionStore();
  const log = new FakeLogger();
  return { config, decision, files, session, log, deps: { config, decision, files, session, log } };
}

export const OFFERED = {
  s1: "Migration: Write and roll back a schema migration.",
  s2: "Release: Cut a release: changelog, tag, notes.",
  s3: "review: Review a change",
  none: "None of these playbooks helps with this request.",
};
export const NO_MODEL_WARNING =
  "warn: skills.suggest is on and the host has no decision model: no skill is suggested (set Orkeon:Decision:Provider, or Orkeon:TypeSafe)";
export const SUGGESTED_LINE = `info: skills suggested for this turn: ${RELEASE}`;

export const USER_ONLY = "/workspace/.claude/skills/deploy/SKILL.md";
export const USER_ONLY_TEXT = "---\nname: deploy\ndescription: Deploy to production\ndisable-model-invocation: true\n---\nRun the deploy.";

/** A project's own folder holding 30 skills and 10 other files, listed out of order. */
export function manySkills(files: FakeFiles): void {
  const names = Array.from({ length: 30 }, (_, i) => `skill-${String(30 - i).padStart(2, "0")}.md`);
  files.listings.set("/workspace/.orkeon/skills", [...Array.from({ length: 10 }, (_, i) => `note-${i}.txt`), ...names]);
  for (const name of names) files.files.set(`/workspace/.orkeon/skills/${name}`, `# ${name}\nA skill.`);
}

