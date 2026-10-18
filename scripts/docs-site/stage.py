#!/usr/bin/env python3
"""Stages the user documentation for docfx: a copy of the pages, made for the site, never the sources.

    python3 scripts/docs-site/stage.py <staging folder>

The repository is written for GitHub: `README.md` is the home page, a folder opens on its `README.md`,
and pages link to files that are not documentation (`LICENSE`, the READMEs under `.devcontainer/`).
The site needs the same pages under other names and with other targets, so this script copies

    README.md, README.fr.md     ->  index.md, index.fr.md        the home page, English and French
    toc.yml                     ->  toc.yml                      the navigation bar
    docs/**                     ->  docs/**                      `README.md` becoming `index.md`

and, in the copy only:

  - a link to a published page follows the page to its staged name;
  - a link to a file or a folder of the repository that is not published becomes a link to GitHub;
  - a link to something that does not exist stops the build: it is broken on GitHub too.

The `href` of the `toc.yml` files go through the same rules, so that a navigation entry can name a
file of the repository by its relative path. Fenced code blocks and code spans are left untouched,
and a staged page keeps the line numbers of its source: a docfx warning names the line to fix.
docfx then checks what stays inside the site: links between pages and their anchors.

`file-metadata.json`, written next to the pages and read by docfx.json, gives each page its source
on GitHub (`docurl`), the target of "Edit this page".
"""

from __future__ import annotations

import json
import os
import posixpath
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import quote, unquote

REPO_URL = "https://github.com/Orkeon/orkeon-code"
BRANCH = "main"

ROOT = Path(__file__).resolve().parents[2]

# Source path -> staged path, for what is published outside docs/.
ROOT_FILES = {
    "README.md": "index.md",
    "README.fr.md": "index.fr.md",
    "toc.yml": "toc.yml",
}
DOCS = "docs"

# What the staging folder holds besides the pages: its marker, and the metadata docfx.json reads.
MARKER = ".docs-site-staging"
FILE_METADATA = "file-metadata.json"

SCHEME = re.compile(r"^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)")
FENCE = re.compile(r"^\s*(?:>\s*)*(`{3,}|~{3,})")
CODE_SPAN = re.compile(r"(?<!`)(`+)(?!`).*?(?<!`)\1(?!`)")
# [text](target), ![alt](target), with an optional title; the target may be written <target>.
INLINE_LINK = re.compile(r"(\]\(\s*)(<[^>\n]*>|[^\s()]+)((?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\))")
HTML_ATTRIBUTE = re.compile(r"(\b(?:src|href)\s*=\s*)(\"[^\"]*\"|'[^']*')")
REFERENCE_DEFINITION = re.compile(r"^(\s{0,3}\[[^\]]+\]:\s*)(\S+)")
TOC_HREF = re.compile(r"^(\s*(?:-\s+)?(?:href|topicHref|tocHref|homepage)\s*:\s*)(\S.*?)(\s*)$")


def published_files() -> dict[str, str]:
    """Every published file of the repository: source path -> staged path, both relative, with /."""
    published = dict(ROOT_FILES)
    for path in sorted((ROOT / DOCS).rglob("*")):
        if not path.is_file():
            continue
        source = path.relative_to(ROOT).as_posix()
        staged = source
        if path.name == "README.md":
            staged = posixpath.join(posixpath.dirname(source), "index.md")
        published[source] = staged
    by_staged: dict[str, str] = {}
    for source, staged in published.items():
        if staged in by_staged:
            sys.exit(f"docs-site/stage.py: {source} and {by_staged[staged]} would both be staged as {staged}")
        by_staged[staged] = source
    for source in ROOT_FILES:
        if not (ROOT / source).is_file():
            sys.exit(f"docs-site/stage.py: {source} is missing")
    return published


class Stager:
    def __init__(self, published: dict[str, str]) -> None:
        self.published = published
        self.errors: list[str] = []
        self.to_github = 0

    def rewrite(self, target: str, source: str, line: int) -> str:
        """The target of a link found in `source`, as the staged copy of `source` must write it."""
        if not target or target.startswith("#") or SCHEME.match(target):
            return target
        path, anchor = target, ""
        for separator in ("#", "?"):
            if separator in path:
                path, _, rest = path.partition(separator)
                anchor = separator + rest + anchor
        if not path or path.startswith("/"):
            return target
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source), unquote(path)))
        if resolved == ".." or resolved.startswith("../"):
            self.errors.append(f"{source}:{line}: {target} leaves the repository")
            return target
        if (ROOT / resolved).is_dir() and posixpath.join(resolved, "README.md") in self.published:
            # A published folder opens on its README, as on GitHub.
            resolved = posixpath.join(resolved, "README.md")
        staged = self.published.get(resolved)
        if staged is not None:
            if staged == resolved:
                return target
            start = posixpath.dirname(self.published[source]) or "."
            return quote(posixpath.relpath(staged, start)) + anchor
        if not (ROOT / resolved).exists():
            self.errors.append(f"{source}:{line}: {target} does not exist ({resolved})")
            return target
        self.to_github += 1
        kind = "tree" if (ROOT / resolved).is_dir() else "blob"
        return f"{REPO_URL}/{kind}/{BRANCH}/{quote(resolved)}{anchor}"

    def markdown(self, text: str, source: str) -> str:
        lines = text.split("\n")
        fence = ""
        for number, line in enumerate(lines, start=1):
            opening = FENCE.match(line)
            if fence:
                # A fence closes on the same character, at least as long, with nothing after it.
                if opening and opening.group(1)[0] == fence[0] and len(opening.group(1)) >= len(fence) \
                        and not line[opening.end():].strip():
                    fence = ""
                continue
            if opening:
                fence = opening.group(1)
                continue
            lines[number - 1] = self.markdown_line(line, source, number)
        return "\n".join(lines)

    def markdown_line(self, line: str, source: str, number: int) -> str:
        def bare(match: re.Match[str]) -> str:
            return match.group(1) + self.rewrite(match.group(2), source, number)

        def inline(match: re.Match[str]) -> str:
            target = match.group(2)
            if target.startswith("<"):
                target = "<" + self.rewrite(target[1:-1], source, number) + ">"
            else:
                target = self.rewrite(target, source, number)
            return match.group(1) + target + match.group(3)

        def attribute(match: re.Match[str]) -> str:
            quoted = match.group(2)
            return match.group(1) + quoted[0] + self.rewrite(quoted[1:-1], source, number) + quoted[0]

        def prose(part: str) -> str:
            part = INLINE_LINK.sub(inline, part)
            return HTML_ATTRIBUTE.sub(attribute, part)

        line = REFERENCE_DEFINITION.sub(bare, line)
        out, position = [], 0
        for span in CODE_SPAN.finditer(line):
            out += [prose(line[position:span.start()]), span.group(0)]
            position = span.end()
        out.append(prose(line[position:]))
        return "".join(out)

    def toc(self, text: str, source: str) -> str:
        lines = text.split("\n")
        for number, line in enumerate(lines, start=1):
            match = TOC_HREF.match(line)
            if not match:
                continue
            value = match.group(2)
            quote_mark = value[0] if value[0] in "\"'" and value.endswith(value[0]) and len(value) > 1 else ""
            target = value[1:-1] if quote_mark else value
            # Another toc.yml, or the folder of one, is docfx's own business: the nested navigation.
            nested = posixpath.normpath(posixpath.join(posixpath.dirname(source), target))
            if target.endswith("/"):
                nested = posixpath.join(nested, "toc.yml")
            if posixpath.basename(nested) == "toc.yml" and nested in self.published:
                continue
            target = self.rewrite(target, source, number)
            lines[number - 1] = f"{match.group(1)}{quote_mark}{target}{quote_mark}{match.group(3)}"
        return "\n".join(lines)


def prepare(staging: Path) -> None:
    """An empty staging folder. Only a folder this script made is emptied: anything else is refused."""
    if ROOT not in staging.parents or ROOT / DOCS in [staging, *staging.parents]:
        sys.exit(f"docs-site/stage.py: {staging} is not a folder of the repository, outside {DOCS}/")
    if staging.exists():
        if not (staging / MARKER).is_file() and (not staging.is_dir() or any(staging.iterdir())):
            sys.exit(f"docs-site/stage.py: {staging} exists and was not staged by this script: not touched")
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    (staging / MARKER).write_text("Staged by scripts/docs-site/stage.py: rebuilt on every run.\n", encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__.split("\n\n")[1].strip().replace("python3", "usage: python3", 1))
    staging = Path(sys.argv[1]).resolve()
    published = published_files()
    stager = Stager(published)
    prepare(staging)

    # docfx matches the keys of the file metadata against paths relative to docfx.json, at the root.
    prefix = staging.relative_to(ROOT).as_posix()
    docurl: dict[str, str] = {}
    for source, staged in published.items():
        destination = staging / staged
        destination.parent.mkdir(parents=True, exist_ok=True)
        if source.endswith(".md"):
            text = (ROOT / source).read_text(encoding="utf-8")
            destination.write_text(stager.markdown(text, source), encoding="utf-8", newline="\n")
            docurl[f"{prefix}/{staged}"] = f"{REPO_URL}/blob/{BRANCH}/{quote(source)}"
        elif posixpath.basename(source) == "toc.yml":
            text = (ROOT / source).read_text(encoding="utf-8")
            destination.write_text(stager.toc(text, source), encoding="utf-8", newline="\n")
        else:
            shutil.copyfile(ROOT / source, destination)
    (staging / FILE_METADATA).write_text(
        json.dumps({"docurl": docurl}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )

    if stager.errors:
        print("\n".join(stager.errors), file=sys.stderr)
        sys.exit(f"docs-site/stage.py: {len(stager.errors)} broken link(s) in the sources")
    print(
        f"docs-site/stage.py: {len(docurl)} pages staged in {os.path.relpath(staging)}, "
        f"{stager.to_github} links out of the site sent to GitHub"
    )


if __name__ == "__main__":
    main()
