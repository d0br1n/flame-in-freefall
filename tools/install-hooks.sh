#!/bin/sh
# Points git at the shared hooks in tools/hooks/ for this clone. Safe to run again.
# Claude sessions run it at session start; humans run it once after cloning.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [ "$(git -C "$root" config --get core.hooksPath)" != "tools/hooks" ]; then
    git -C "$root" config core.hooksPath tools/hooks
    [ "$1" = "--quiet" ] || echo "git hooks now come from tools/hooks/"
fi
