#!/usr/bin/env bash
# Builds the documentation site (docfx) into _site/, from the pages GitHub shows: README.md,
# README.fr.md and docs/. Run by .github/workflows/docs.yml, and by hand to check a change:
#
#   scripts/build-docs-site.sh            # stage, then docfx build --warningsAsErrors
#   scripts/build-docs-site.sh --serve    # the same, then serve _site/ on http://localhost:8080
#
# It needs python3 and docfx, the version DOCFX_VERSION of the workflow
# (`dotnet tool install -g docfx --version <version>`); DOCFX names another docfx binary. Any
# argument goes to `docfx build`.
#
# The sources are never modified: scripts/docs-site/stage.py copies them to _site-src/, where the
# READMEs become index pages and the links that leave the documentation point to GitHub, and docfx
# builds that copy (docfx.json, the toc.yml files, scripts/docs-site/template/). A warning fails the
# build: a broken link or anchor, a toc.yml entry without its page.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

docfx=${DOCFX:-docfx}
if ! command -v "$docfx" >/dev/null 2>&1; then
  echo "build-docs-site: docfx not found (dotnet tool install -g docfx, or set DOCFX)" >&2
  exit 1
fi

rm -rf _site
python3 scripts/docs-site/stage.py _site-src
"$docfx" build docfx.json --warningsAsErrors "$@"
