#!/usr/bin/env node
// prepublishOnly: the npm package is published by the release workflow only, on the tag of its version. Run
// anywhere else (a laptop, another job, a tag that does not match package.json), `npm publish` stops here.
//   node scripts/check-publish.mjs
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const env = process.env;
if (env.GITHUB_ACTIONS !== "true") {
  console.error("check-publish: orkeon-code is published by the release workflow only (GITHUB_ACTIONS is not true).");
  process.exit(1);
}
if (env.GITHUB_REF_NAME !== `v${version}`) {
  console.error(`check-publish: the tag ${env.GITHUB_REF_NAME ?? "(none)"} is not v${version} (package.json).`);
  process.exit(1);
}
console.log(`check-publish: publishing orkeon-code ${version} from ${env.GITHUB_REF_NAME}.`);
