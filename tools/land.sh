#!/usr/bin/env bash
# Land your commits on main. Only git is needed, no GitHub CLI.
#
#   tools/land.sh          hand the commits to the landing bot and return at once
#   tools/land.sh --wait   also wait (up to 3 minutes) until they are on main
#
# What it does: rebases your branch on origin/main and pushes it to `land/<who>-<branch>`.
# The landing bot (.github/workflows/auto-land.yml) opens the pull request and arms
# auto-merge; it merges by itself when the required check `gate` is green.
# Run it from any branch, your local main included. Run it again after more commits or a fix:
# the same pull request is updated. A change that edits the gate waits for a human to merge it.
# Code generated with SI assistance (Claude Code), reviewed by the team.
set -euo pipefail

die() { echo "land: $*" >&2; exit 1; }

WAIT=0
for arg in "$@"; do
    case "$arg" in
        --wait) WAIT=1 ;;
        -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "unknown option $arg" ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"
branch=$(git symbolic-ref --quiet --short HEAD) || die "you are on a detached HEAD, switch to a branch"
case "$branch" in land/*) die "you are on a landing branch, switch to your own branch" ;; esac

git fetch --quiet origin main
git rebase --quiet --autostash origin/main \
    || die "conflict while rebasing on origin/main. Fix it, run 'git rebase --continue', then tools/land.sh again"
[ -n "$(git rev-list origin/main..HEAD)" ] || die "nothing to land: no commits ahead of origin/main"

who=${SWARM_ID:-$(git config user.name || hostname)}
slug=$(printf '%s-%s' "$who" "$branch" | tr '[:upper:]' '[:lower:]' | sed 's#[ /]#-#g' | tr -cd 'a-z0-9._-' | cut -c1-80)
target="land/$slug"
# The landing branch is a throwaway copy of what you want on main, so overwriting it is right.
git push --quiet --force origin "HEAD:refs/heads/$target"

repo=$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://([^@/]*@)?github\.com/)##; s#\.git$##')
echo "land: pushed $(git rev-list --count origin/main..HEAD) commit(s) to $target"
echo "land: the bot opens the pull request, it merges when the gate is green: https://github.com/$repo/pulls"

[ "$WAIT" = 1 ] || exit 0
for _ in $(seq 1 36); do
    sleep 5
    git fetch --quiet origin main
    # Merged when main holds an equivalent of every commit (a rebase merge changes the hashes).
    if [ -z "$(git cherry origin/main HEAD | grep '^+' || true)" ]; then
        echo "land: merged. Your commits are on origin/main."
        exit 0
    fi
    # main moved under us and no longer merges cleanly: say so now, do not wait it out.
    # (git merge-tree exits 1 on a conflict; older gits without --write-tree exit otherwise.)
    conflict=0
    git merge-tree --write-tree origin/main HEAD >/dev/null 2>&1 || conflict=$?
    if [ "$conflict" = 1 ]; then
        die "CONFLICT with main: someone landed a change to the same lines. Run tools/land.sh again: it rebases and stops at the conflict; fix it, 'git rebase --continue', then tools/land.sh once more"
    fi
done
die "not merged after 3 minutes. Open https://github.com/$repo/pulls : a red gate, a conflict with main, or a change to the gate that waits for a human"
