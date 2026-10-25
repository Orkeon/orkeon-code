// The package.json fallbackConventions is tested on.

/** Three scripts and two devDependencies. */
export const FULL_PKG = JSON.stringify({
  scripts: { build: "tsc", test: "vitest", lint: "eslint ." },
  devDependencies: { vitest: "1", typescript: "5" },
});
