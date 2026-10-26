// The checkout and fakes runInitVerifiers is tested over.
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

export const PKG = "{\"scripts\":{\"build\":\"tsc\"}}";

/** A checkout holding a package.json with a build script and a src folder. */
export function initVerifiersSetup() {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE, ["package.json", "src"]);
  files.files.set(`${WORKSPACE}/package.json`, PKG);
  const llm = new FakeLlm();
  const log = new FakeLogger();
  return { files, llm, log, deps: { files, llm, log } };
}

/** The skills written for the zones api and Web UI. */
export const TWO_SKILLS = [
  { path: "/output/verifiers/verify-api.md", content: "# api checks\n" },
  { path: "/output/verifiers/verify-web-ui.md", content: "# ui checks\n" },
];
