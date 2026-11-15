#!/usr/bin/env bash
# Reach the team's second Oracle server (nasa2) from any machine that already reaches the
# hub (ssh alias "nasa"). The hop goes through the hub, which holds the nasa2 key, so a
# laptop needs no new key, ip or ssh config.
#
#   tools/nasa2.sh                     interactive shell on nasa2
#   tools/nasa2.sh <command> [args]    run one command there, args kept as they are
#   tools/nasa2.sh -c '<shell line>'   run a shell line there (pipes, redirects, cd ...)
#
# stdin is passed through, so `tools/nasa2.sh -c 'cat > f.txt' < f.txt` copies a file.
# Where "ssh nasa2" already works by itself (on the hub, or a laptop with its own nasa2
# entry in ~/.ssh/config) it connects directly. Env: NASA_HOST (default "nasa").
set -euo pipefail

HUB="${NASA_HOST:-nasa}"
die() { echo "nasa2: $*" >&2; exit 1; }

line=""
case "${1:-}" in
  -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit ;;
  -c) [ $# -ge 2 ] || die "-c needs a shell line"; line="$2" ;;
  "") ;;
  *) line="$(printf '%q ' "$@")" ;;
esac

tty=""   # a plain string, not an array: macOS bash 3.2 + set -u rejects an empty array
[ -t 0 ] && [ -t 1 ] && tty="-t"

# A real nasa2 entry in ~/.ssh/config resolves to an address, not to the bare alias.
if [ "$(ssh -G nasa2 2>/dev/null | awk '/^hostname /{print $2}')" != "nasa2" ]; then
  if [ -n "$line" ]; then exec ssh $tty nasa2 "$line"; else exec ssh nasa2; fi
fi

ssh -n -o BatchMode=yes -o ConnectTimeout=10 "$HUB" true 2>/dev/null \
  || die "cannot reach the hub: \"ssh $HUB true\" must work first (see docs/sending-files.md)"

if [ -n "$line" ]; then
  exec ssh $tty "$HUB" "ssh $tty nasa2 $(printf '%q' "$line")"
else
  exec ssh -t "$HUB" "ssh -t nasa2"
fi
