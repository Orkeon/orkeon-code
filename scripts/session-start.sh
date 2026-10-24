#!/bin/sh
# Orkeon Code's session start script: what a new session should know about the dev work
# left in progress in the project, printed once at the REPL's start. The runtime runs the
# file Orkeon:Cli:Session:StartScript names (`sh <file>`, in the project, /workspace) and
# puts what it prints before the first free-text turn; /assistant hands it to the main
# loop, which keeps it as a [turn-context] message. The launcher copies this file to
# /tmp/orkeon-code/session-start.sh at every start and sets the key.
#
#   sh scripts/session-start.sh [<project dir>]      (default: the working directory)
#
# Read-only, POSIX sh, silent when there is nothing to say. It lists, under
# .orkeon/dev/<code>/ (Code's own state, never committed):
#   - each state-F<n>.md written in the last 7 days, with its date and its First open line
#     (the file a compaction wrote for the batch in progress);
#   - each batches-state.md whose event log leaves batches open (last event of the batch
#     launched, relaunched or stall, with no `closed` line after it).
root="${1:-.}"
dev="$root/.orkeon/dev"
[ -d "$dev" ] || exit 0

states=$(find "$dev" -mindepth 2 -maxdepth 2 -type f -name 'state-F*.md' -mtime -7 2>/dev/null | sort)
logs=$(find "$dev" -mindepth 2 -maxdepth 2 -type f -name 'batches-state.md' 2>/dev/null | sort)

body=$(
printf '%s\n' "$states" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  shown=${f#"$root"/}
  at=$(sed -n '1s/^# State of batch .* written at \([^ ]*\) before .*/\1/p' "$f")
  open=$(sed -n 's/^First open: //p' "$f" | head -n 1)
  [ -n "$open" ] || open="no open step"
  echo "- state of a batch: $shown (written ${at:-at an unknown time}); first open step: $open. Read it before going on with that batch."
done

printf '%s\n' "$logs" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  open=$(awk '
    { sub(/\r$/, "") }
    /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9] closed[ \t]*$/ { closed = NR; next }
    /^- [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9] F[0-9]+ (launched|relaunched|returned|merged|stopped|stall)([ \t].*)?$/ {
      if (!($4 in at)) order[++n] = $4
      at[$4] = NR; ev[$4] = $5
    }
    END {
      out = ""
      for (i = 1; i <= n; i++) {
        b = order[i]
        if ((ev[b] == "launched" || ev[b] == "relaunched" || ev[b] == "stall") && at[b] > closed) out = out (out == "" ? "" : " ") b
      }
      print out
    }' "$f")
  [ -n "$open" ] || continue
  echo "- open batch(es) in ${f#"$root"/}: $open"
done
)
[ -n "$body" ] || exit 0
echo "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):"
printf '%s\n' "$body"
exit 0
