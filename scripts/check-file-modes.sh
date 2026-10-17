#!/usr/bin/env bash
# Every shell script, the launcher and every shebang script (.mjs, .py, .ps1) is committed with the
# executable bit (100755). A Windows/NTFS checkout hides a missing bit; a Linux or
# macOS clone restores the committed mode and fails with "permission denied".
#
#   bash scripts/check-file-modes.sh
# Fix one: git update-index --chmod=+x <path>
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

bad=0
while IFS=$'\t' read -r meta path; do
  mode="${meta%% *}"
  case "$path" in
    *.sh|orkeon-code) needs=1 ;;
    *.mjs|*.py|*.ps1) [ "$(head -c 2 "$path")" = "#!" ] && needs=1 || needs=0 ;;
    *) needs=0 ;;
  esac
  if [ "$needs" = 1 ] && [ "$mode" != "100755" ]; then
    echo "not executable in the index: $path ($mode)"
    bad=1
  fi
done < <(git ls-files -s -- '*.sh' '*.mjs' '*.py' '*.ps1' 'orkeon-code')

if [ "$bad" = 1 ]; then
  echo "fix with: git update-index --chmod=+x <path>"
  exit 1
fi
echo "file modes: ok"
