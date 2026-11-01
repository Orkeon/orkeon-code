// The checkout and fakes runInitVerifiers is tested over.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";
import { CI_WORKFLOWS_DIR } from "../../../../src/shared/domain/project-manifests.ts";

export const PKG = "{\"scripts\":{\"build\":\"tsc\"}}";

/** The command line the instructions file's Commands section states. */
export const COMMANDS_LINE = "npm run check   # every check";

/** An AGENTS.md whose Commands section holds COMMANDS_LINE. */
export const AGENTS_MD = `# Sample\n\n## Commands\n\n${COMMANDS_LINE}\n\n## Rules\n\nno secrets\n`;

/** The script line of a pyproject.toml. */
export const PYPROJECT_SCRIPT = "test = \"pytest -q\"";

export const PYPROJECT = `[project]\nname = "sample"\n\n[tool.hatch.envs.default.scripts]\n${PYPROJECT_SCRIPT}\n`;

/** A step of the CI workflow, a command no manifest nor Commands section states. */
export const CI_STEP = "run: npm run lint -- --max-warnings 0";

/** Two CI workflows, by name. */
export const WORKFLOWS: Record<string, string> = {
  "ci.yml": `jobs:\n  check:\n    steps:\n      - ${CI_STEP}\n`,
  "release.yml": "on: release\n",
};

/**
 * A checkout holding `files` at the top level (by default a package.json with a
 * build script) beside a src folder, and `workflows` (name to content) under .github/workflows.
 */
export function initVerifiersSetup(checkout: { files?: Record<string, string>; workflows?: Record<string, string> } = {}) {
  const contents = checkout.files ?? { "package.json": PKG };
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, [...Object.keys(contents), "src"]);
  for (const [name, text] of Object.entries(contents)) files.files.set(`${WORKSPACE}/${name}`, text);
  const workflows = checkout.workflows ?? {};
  if (checkout.workflows) files.listings.set(`${WORKSPACE}/${CI_WORKFLOWS_DIR}`, Object.keys(workflows));
  for (const [name, text] of Object.entries(workflows)) files.files.set(`${WORKSPACE}/${CI_WORKFLOWS_DIR}/${name}`, text);
  const llm = new FakeLlm();
  const log = new FakeLogger();
  return { files, llm, log, deps: { files, llm, log } };
}

/** A Node checkout with an AGENTS.md stating its commands and two CI workflows. */
export function documentedSetup() {
  return initVerifiersSetup({ files: { "package.json": PKG, "AGENTS.md": AGENTS_MD }, workflows: WORKFLOWS });
}

/** The parts of the material every prompt of documentedSetup carries. */
export const DOCUMENTED_MATERIAL = [PKG, COMMANDS_LINE, CI_STEP];

/** The skills written for the zones api and Web UI. */
export const TWO_SKILLS = [
  { path: "/output/verifiers/verify-api.md", content: "# api checks\n" },
  { path: "/output/verifiers/verify-web-ui.md", content: "# ui checks\n" },
];
