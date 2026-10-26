// The checkout and fakes runProjectInit is tested over.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
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

/** The conventions the model detects from PKG. */
export const DETECTED = { buildCommand: "npm run build", testCommand: "npm test", frameworks: ["vitest"], conventions: [] };
