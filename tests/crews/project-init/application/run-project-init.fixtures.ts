// The checkout and fakes runProjectInit is tested over.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeCodeIndex } from "../../../support/doubles/fake-code-index.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const PKG = "{\"scripts\":{\"build\":\"tsc\",\"test\":\"vitest\"}}";

/** A checkout listing package.json and src, a model answering a fenced "# Project". */
export function projectInitSetup() {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["package.json", "src"]);
  const llm = new FakeLlm();
  llm.completions = ["```markdown\n# Project\n```"];
  const log = new FakeLogger();
  return { files, llm, log, deps: { files, llm, log } };
}

/** A step of a CI workflow, a command no manifest states. */
export const CI_STEP = "run: make check-all";

/** The CI workflow holding CI_STEP. */
export const CI_WORKFLOW = `jobs:\n  check:\n    steps:\n      - ${CI_STEP}\n`;

/** projectInitSetup with a package.json and the CI workflow ci.yml holding CI_STEP. */
export function setupWithCiWorkflow() {
  const setup = projectInitSetup();
  setup.files.files.set(`${WORKSPACE}/package.json`, PKG);
  setup.files.listings.set(`${WORKSPACE}/.github/workflows`, ["ci.yml"]);
  setup.files.files.set(`${WORKSPACE}/.github/workflows/ci.yml`, CI_WORKFLOW);
  setup.llm.extractions = [DETECTED];
  return setup;
}

/** The conventions the model detects from PKG. */
export const DETECTED = { buildCommand: "npm run build", testCommand: "npm test", frameworks: ["vitest"], conventions: [] };

/** A code index holding one root and one package. */
export function indexWithOnePackage(): FakeCodeIndex {
  const index = new FakeCodeIndex();
  index.roots = 1;
  index.maps["L1_Package"] = { entries: [{ fqn: "/workspace::Core", name: "Core", kind: "package" }], symbolCount: 0 };
  return index;
}

/** The rules of the instructions-file system message, each with the words that carry it. */
export const INSTRUCTIONS_RULES: Array<{ rule: string; marker: string }> = [
  { rule: "works from the visible part of a cut file", marker: "ends with a `[… cut:` line was cut there" },
  { rule: "reads a cut line inside the package map as the map cut there", marker: "a `[… cut:` line inside `<package-map>` means the map was cut there too: work from the part you see, never guess what follows" },
  { rule: "keeps a true fact over a brevity rule", marker: "keeping it wins over the rules below" },
  { rule: "names an existing file that stays on disk instead of dropping its long part", marker: "an existing file other than AGENTS.md stays on disk, so name it as the file to read for that part" },
  { rule: "keeps what only AGENTS.md says under a Reference section", marker: "what only AGENTS.md says, since your file replaces it, is kept as it was under a last `## Reference` section" },
  { rule: "draws the Architecture section from the package map, the README and the existing files only", marker: "drawn from the package map, the README and the existing files only" },
  { rule: "names a package as the map writes it", marker: "a package is named as the map writes it" },
  { rule: "adds nothing the material does not show to the Architecture section", marker: "nothing they do not show is added" },
  { rule: "leaves the Architecture section out without a package map", marker: "With no package map, keep only what the existing files say of it, or leave the section out" },
  { rule: "lists no package", marker: "No list of files or folders, nor of packages" },
  { rule: "leaves out the conventions of the language", marker: "no convention of the language any agent already knows" },
  { rule: "names the file to read instead of a long reference", marker: "no long reference or tutorial (name the file to read instead)" },
  { rule: "leaves out the facts that change often", marker: "no fact that changes often" },
  { rule: "bounds a section to one screen", marker: "Each section fits on one screen" },
  { rule: "takes a command from the configuration first, an existing file next, never the README's prose", marker: "by the configuration (the detected commands) first, by an existing instruction file when the configuration states none, never by the README's prose" },
];

/** The rules of the conventions prompt, each with the words that carry it. */
export const CONVENTIONS_RULES: Array<{ rule: string; marker: string }> = [
  { rule: "takes a CI step as a source of a command", marker: "A step of a CI workflow is a valid source of a command" },
  { rule: "asks for the run command as the configuration states it", marker: "runCommand (start the project, as the configuration states it)" },
];
