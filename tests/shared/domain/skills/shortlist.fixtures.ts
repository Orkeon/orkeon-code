// The cases of shared/domain/skills/shortlist.ts: skill files, their cards, what the decision model says of them.
import type { DecisionAnswers } from "../../../../src/shared/domain/decision/questions.ts";
import type { SkillCard, SkillPick } from "../../../../src/shared/domain/skills/shortlist.ts";

export const CARD_CASES: readonly { readonly name: string; readonly path: string; readonly head: string; readonly expected: SkillCard }[] = [
  {
    name: "reads the name and the description of a front matter",
    path: "/workspace/.claude/skills/release/SKILL.md",
    head: '---\nname: release\ndescription: "Cut a release: changelog, tag, notes"\n---\n# Release\nSteps follow.',
    expected: { path: "/workspace/.claude/skills/release/SKILL.md", name: "release", description: "Cut a release: changelog, tag, notes" },
  },
  {
    name: "reads the first heading and the first paragraph when there is no front matter",
    path: "/workspace/.orkeon/skills/db-migration.md",
    head: "# Database migration\n\nHow to write and  roll back\na schema migration.\n\n## Steps",
    expected: { path: "/workspace/.orkeon/skills/db-migration.md", name: "Database migration", description: "How to write and roll back" },
  },
  {
    name: "names a skill after its file when it has no heading",
    path: "/workspace/.orkeon/skills/db-migration.md",
    head: "Write the migration first.",
    expected: { path: "/workspace/.orkeon/skills/db-migration.md", name: "db-migration", description: "Write the migration first." },
  },
  {
    name: "names a SKILL.md after its folder when its front matter has no name",
    path: "/workspace/.claude/skills/release/SKILL.md",
    head: "---\ndescription: Cut a release\n---\n",
    expected: { path: "/workspace/.claude/skills/release/SKILL.md", name: "release", description: "Cut a release" },
  },
  {
    name: "reads a folded description from its indented lines",
    path: "/workspace/.claude/skills/release/SKILL.md",
    head: "---\nname: release\ndescription: >\n  Cut a release:\n  changelog, tag, notes\nother: x\n---\n",
    expected: { path: "/workspace/.claude/skills/release/SKILL.md", name: "release", description: "Cut a release: changelog, tag, notes" },
  },
  {
    name: "reads a front matter after a byte order mark",
    path: "/workspace/.claude/skills/release/SKILL.md",
    head: "\uFEFF---\nname: release\ndescription: Cut a release\n---\n",
    expected: { path: "/workspace/.claude/skills/release/SKILL.md", name: "release", description: "Cut a release" },
  },
  {
    name: "reads a front matter the head cuts short as far as it goes",
    path: "/workspace/.claude/skills/release/SKILL.md",
    head: "---\nname: release\ndescription: Cut a release\nallowed-tools: Rea",
    expected: { path: "/workspace/.claude/skills/release/SKILL.md", name: "release", description: "Cut a release" },
  },
  {
    name: "gives an empty description to an empty front matter with nothing under it",
    path: "/workspace/.orkeon/skills/empty.md",
    head: "---\n---\n",
    expected: { path: "/workspace/.orkeon/skills/empty.md", name: "empty", description: "" },
  },
  {
    name: "reads no heading nor description inside a code fence",
    path: "/workspace/.orkeon/skills/deploy.md",
    head: "```bash\n# not a title\nmake deploy\n```\n# Deploy\nShip the build.",
    expected: { path: "/workspace/.orkeon/skills/deploy.md", name: "Deploy", description: "Ship the build." },
  },
];

export const OFFERABLE_CASES: readonly { readonly name: string; readonly head: string; readonly offerable: boolean }[] = [
  { name: "offers a skill without a front matter", head: "# Release\nCut a release.", offerable: true },
  { name: "offers a skill whose front matter does not keep it for a person", head: "---\nname: release\n---\n", offerable: true },
  { name: "does not offer a skill kept for a person to invoke", head: "---\nname: release\ndisable-model-invocation: true\n---\n", offerable: false },
  { name: "offers a skill that says false", head: "---\ndisable-model-invocation: false\n---\n", offerable: true },
];

export const KEY_CASES: readonly { readonly path: string; readonly key: string }[] = [
  { path: "/workspace/.orkeon/skills/a.md", key: ".orkeon/skills/a.md" },
  { path: "./.orkeon/skills/a.md", key: ".orkeon/skills/a.md" },
  { path: " .orkeon/skills/a.md ", key: ".orkeon/skills/a.md" },
];

export const LONG_HEAD = `# Long\n${"d".repeat(400)}`;

export const CARDS: readonly SkillCard[] = [
  { path: "/workspace/.orkeon/skills/release.md", name: "release", description: "Cut a release" },
  { path: "/workspace/.orkeon/skills/migration.md", name: "migration", description: "" },
  { path: "/workspace/.orkeon/skills/review.md", name: "review", description: "Review a change" },
];

const chose = (choice: string, probabilities: Record<string, number>): DecisionAnswers => ({
  skill: { type: "choice", choice, confidence: probabilities[choice] ?? 0, probabilities },
});

export const PICK_CASES: readonly { readonly name: string; readonly answers: DecisionAnswers | null; readonly expected: SkillPick[] }[] = [
  {
    name: "suggests the skills whose share reaches 0.3, the largest first",
    answers: chose("s3", { s1: 0.35, s2: 0.05, s3: 0.5, none: 0.1 }),
    expected: [{ path: "/workspace/.orkeon/skills/review.md", share: 0.5 }, { path: "/workspace/.orkeon/skills/release.md", share: 0.35 }],
  },
  {
    name: "suggests a skill at exactly 0.3",
    answers: chose("s1", { s1: 0.3, s2: 0.29, s3: 0.2, none: 0.21 }),
    expected: [{ path: "/workspace/.orkeon/skills/release.md", share: 0.3 }],
  },
  { name: "suggests none when the model chose that none fits", answers: chose("none", { s1: 0.4, none: 0.6 }), expected: [] },
  { name: "suggests none when no share reaches 0.3", answers: chose("s1", { s1: 0.28, s2: 0.26, s3: 0.25, none: 0.21 }), expected: [] },
  { name: "suggests none without an answer", answers: null, expected: [] },
  { name: "suggests none from an answer that is no choice", answers: { skill: { type: "noul", probability: 0.9 } }, expected: [] },
];
