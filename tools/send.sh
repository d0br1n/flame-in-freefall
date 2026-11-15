#!/usr/bin/env bash
# Send files or folders between laptops and the team's Oracle server (ssh alias "nasa",
# the same one the swarm uses).
#
#   On a laptop:   files land in ~/inbox/<your name>/ on the server (log: ~/inbox/log.tsv).
#   On the server: files land in ~/outbox/ (log: ~/outbox/log.tsv); laptops cannot be
#                  reached from the server, so teammates pull them with tools/get.sh.
#
#   tools/send.sh [-m "note"] <file-or-dir>...   send
#   tools/send.sh -l                             show the last transfers in this direction
#
# Re-sending a name overwrites the previous copy. Env: NASA_HOST (default "nasa"; "local"
# or a ~/.nasa-hub marker file means "I am the server"), SEND_AS (default: git first name).
set -euo pipefail

HOST="${NASA_HOST:-nasa}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
die() { echo "send: $*" >&2; exit 1; }
[ -e "$HOME/.nasa-hub" ] && HOST=local
remote() {   # runs the script on stdin in the server's home directory
  if [ "$HOST" = local ]; then (cd "$HOME" && bash -s -- "$@")
  else ssh "${SSH_OPTS[@]}" "$HOST" "bash -s -- $(printf '%q ' "$@")"; fi
}
if [ "$HOST" = local ]; then box=outbox; else box=inbox; fi

note=""
while getopts ":m:lh" opt; do
  case "$opt" in
    m) note="$OPTARG" ;;
    l) remote "$box" <<<'tail -n 20 "$1/log.tsv" 2>/dev/null || echo "$1 is empty"'; exit ;;
    h) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit ;;
    *) die "unknown option -$OPTARG (try -h)" ;;
  esac
done
shift $((OPTIND - 1))
[ $# -gt 0 ] || die "nothing to send (try -h)"

who="${SEND_AS:-$(git config user.name 2>/dev/null | awk '{print $1}' || true)}"
who="$(printf '%s' "${who:-${USER:-anon}}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
[ -n "$who" ] || who=anon

srcs=() names=""
for p in "$@"; do
  [ -e "$p" ] || die "no such file: $p"
  p="${p%/}"                       # "dir/" and "dir" both arrive as inbox/<who>/dir
  srcs+=("$p"); names+="${names:+, }$(basename "$p")"
done

if [ "$HOST" = local ]; then who=server; dest=outbox; else dest="inbox/$who"; fi
remote "$dest" <<<'mkdir -p "$1"' || die "cannot reach $HOST (does 'ssh $HOST true' work?)"

if [ "$HOST" = local ]; then
  cp -a -- "${srcs[@]}" "$HOME/$dest/"
elif command -v rsync >/dev/null 2>&1; then
  rsync -a --partial --progress -e "ssh ${SSH_OPTS[*]}" -- "${srcs[@]}" "$HOST:$dest/"
else                               # Git Bash on Windows ships without rsync
  scp -r "${SSH_OPTS[@]}" -- "${srcs[@]}" "$HOST:$dest/"
fi

note="$(printf '%s' "$note" | tr '\t\n' '  ')"
remote "$who" "$names" "$note" "$box" <<<'printf "%s\t%s\t%s\t%s\n" "$(date -u +%FT%TZ)" "$1" "$2" "$3" >> "$4/log.tsv"'

if [ "$HOST" = local ]; then echo "in ~/outbox/ -> $names (laptops fetch with: tools/get.sh <name>)"
else echo "sent to $HOST:~/$dest/ -> $names"; fi
