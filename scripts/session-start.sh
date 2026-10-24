#!/bin/sh
# Orkeon Code's session start script: what a new session should know about the dev work
# left in progress in the project, the twin for a terminal of scripts/session-start.ork.ts,
# the one the launcher installs as Orkeon:Cli:Session:StartScript (the runtime cannot run a
# shell start script: a `.sh` file is refused and `sh` is not in its shell allowlist). The
# REPL puts what that one prints before the first free-text turn; /assistant hands it to the
# main loop, which keeps it as a [turn-context] message. Keep the two printing the same lines.
#
#   sh scripts/session-start.sh [<project dir>]      (default: the working directory)
#
# Read-only, POSIX sh, silent when there is nothing to say. It lists, under
# .orkeon/dev/<code>/ (Code's own state, never committed):
#   - each state-F<n>.md whose header says it was written in the last 7 days (a header without a
#     date that reads keeps it, as the twin does), with that date and its First open line (the
#     file a compaction wrote for the batch in progress);
#   - each batches-state.md whose event log leaves batches open (last event of the batch
#     launched, relaunched or stall, with no `closed` line after it).
root="${1:-.}"
dev="$root/.orkeon/dev"
[ -d "$dev" ] || exit 0

states=$(find "$dev" -mindepth 2 -maxdepth 2 -type f -name 'state-F*.md' 2>/dev/null | sort)
now=$(date -u +%Y-%m-%dT%H:%M:%S)

# 0 when <header date> is more than 7 days before $now; the date read as UTC, its seconds and zone ignored.
# Unreadable, it is kept: the twin's Date.parse gives NaN and keeps the file too.
older_than_a_week() {
  awk -v at="$1" -v now="$now" '
    function days(y, m, d) { if (m <= 2) { y--; m += 12 } return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + d }
    function minutes(t) { return (days(substr(t, 1, 4) + 0, substr(t, 6, 2) + 0, substr(t, 9, 2) + 0) * 24 + substr(t, 12, 2)) * 60 + substr(t, 15, 2) }
    BEGIN {
      if (at !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]/) exit 1
      exit (minutes(now) - minutes(at) > 7 * 24 * 60) ? 0 : 1
    }'
}
logs=$(find "$dev" -mindepth 2 -maxdepth 2 -type f -name 'batches-state.md' 2>/dev/null | sort)

body=$(
printf '%s\n' "$states" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  shown=${f#"$root"/}
  at=$(sed -n '1s/^# State of batch .* written at \([^ ]*\) before .*/\1/p' "$f")
  if [ -n "$at" ] && older_than_a_week "$at"; then continue; fi
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
  code="$(basename "$(dirname "$f")")"
  echo "- open batch(es) in ${f#"$root"/}: $open (/dev-batches $code goes on)"
done
)
[ -n "$body" ] || exit 0
echo "Dev work in progress in this project (Orkeon Code's state under .orkeon/dev/):"
printf '%s\n' "$body"
exit 0
