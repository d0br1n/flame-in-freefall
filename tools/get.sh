#!/usr/bin/env bash
# Fetch files or folders from the team's Oracle server (ssh alias "nasa") to your laptop.
# The server cannot reach laptops, so this is how server -> laptop transfers happen: the
# server session runs tools/send.sh there (files go to ~/outbox/), you pull them here.
#
#   tools/get.sh <name-or-path>...   fetch; a name is looked up in ~/outbox/ first, then as
#                                    a path relative to the server home (or absolute)
#   tools/get.sh -a                  fetch everything in ~/outbox/
#   tools/get.sh -l                  list what is in ~/outbox/ and the last transfers
#   tools/get.sh -o <dir> ...        save somewhere else (default: from-server/ in the repo,
#                                    which is gitignored)
#
# An existing local file with the same name is overwritten. Env: NASA_HOST (default "nasa").
set -euo pipefail

HOST="${NASA_HOST:-nasa}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
die() { echo "get: $*" >&2; exit 1; }
remote() { ssh "${SSH_OPTS[@]}" "$HOST" "bash -s -- $(printf '%q ' "$@")"; }

out="" all=0
while getopts ":o:alh" opt; do
  case "$opt" in
    o) out="$OPTARG" ;;
    a) all=1 ;;
    l) remote <<<'cd "$HOME/outbox" 2>/dev/null || { echo "outbox is empty"; exit 0; }
                  echo "in ~/outbox:"; ls -A | grep -vx log.tsv | sed "s/^/  /"
                  echo "last transfers:"; tail -n 20 log.tsv 2>/dev/null | sed "s/^/  /"'; exit ;;
    h) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit ;;
    *) die "unknown option -$OPTARG (try -h)" ;;
  esac
done
shift $((OPTIND - 1))
[ $all = 1 ] || [ $# -gt 0 ] || die "nothing to fetch (try -l to see the outbox, -h for help)"

[ -n "$out" ] || out="$(git rev-parse --show-toplevel 2>/dev/null || pwd)/from-server"
mkdir -p "$out"

# The server resolves each name and streams one tar archive back; this avoids rsync/scp
# differences between macOS, Linux and Git Bash, and handles spaces in names.
read -r -d '' PACK <<'EOS' || true
cd "$HOME" || exit 4
if [ "$1" = --all ]; then
  [ -d outbox ] || { echo "outbox is empty" >&2; exit 4; }
  exec tar -czf - -C outbox --exclude=./log.tsv .
fi
args=()
for a in "$@"; do
  a="${a#\~/}"; a="${a%/}"
  if [ -e "outbox/$a" ]; then p="outbox/$a"; elif [ -e "$a" ]; then p="$a"
  else echo "not on the server: $a (looked in ~/outbox/ and ~/)" >&2; exit 4; fi
  args+=(-C "$(cd "$(dirname "$p")" && pwd)" "$(basename "$p")")   # absolute: tar -C is cumulative
done
exec tar -czf - "${args[@]}"
EOS

if [ $all = 1 ]; then set -- --all; fi
tmp="$out/.get.$$.tgz"; trap 'rm -f "$tmp"' EXIT
rc=0; remote "$@" <<<"$PACK" > "$tmp" || rc=$?
[ $rc -ne 4 ] || exit 1                     # the server already said what is missing
[ $rc -eq 0 ] || die "cannot reach $HOST (does 'ssh $HOST true' work?)"
tar -xzf "$tmp" -C "$out"
echo "fetched into $out/"
