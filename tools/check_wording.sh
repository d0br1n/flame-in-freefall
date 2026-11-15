#!/usr/bin/env bash
# "Do not say" wording audit (Linear DOB-109, research/RECOMMENDATION-2026-11-14.md section 12).
#
#   tools/check_wording.sh            exit 1 if a banned phrase is found; "review" hits are printed only
#   tools/check_wording.sh --method   also allow "130-300" and "2 degrees" (switch on once DOB-51 is done)
#
# Reads only what a judge reads: the web app text, README.md, submission/PROJECT_PAGE.md, the demo
# script, subtitles and each engine's module.json and findings.json. research/ is left out on purpose:
# it quotes the banned phrases. Matching is case-insensitive and whole-word where a stem would
# otherwise hit "improved" or "approved".
# Code generated with SI assistance (Claude Code), reviewed by the team.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

METHOD_DONE=0
[ "${1:-}" = "--method" ] && METHOD_DONE=1

files=()
for f in README.md submission/PROJECT_PAGE.md submission/DEMO_SCRIPT.md; do [ -f "$f" ] && files+=("$f"); done
while IFS= read -r f; do files+=("$f"); done < <(
    { find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.mdx' \) \
        -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/tests/*' -not -name '*.test.*' 2>/dev/null
      find data/modules -maxdepth 2 \( -name module.json -o -name findings.json \) 2>/dev/null
      find submission -type f \( -name '*.srt' -o -name '*.vtt' -o -name '*SUBTITLE*' -o -name '*PITCH*' \) 2>/dev/null
    } | sort -u)

# BANNED: always a problem.
BANNED=(
  'we save \$'
  'we cut false alarms'
  'we fix the detector'
  'use helium'
  'use CO2'
  'use CO₂'
  'we discovered'
  '\bprove[sd]?\b'
  'extinction temperature'
  'never wrote down how they ended'
  '\brecovered\b'
  'no rival'
  'NASA endorses'
  'NASA uses this'
  'CLD stations require'
  'cannot detect'
  'validated by'
  'experts agree'
  'dust sets off the alarm'
)
# REVIEW: allowed in some contexts; a person reads each hit.
REVIEW=(
  '\bpredict(s|ed|ion)?\b'
  'extinction limit'
  'ISS alarm'
  'spacecraft alarm'
  'alarm stayed silent'
  'Saffire'
  'Apollo 1'
  '\bMir\b'
  'Swissair'
)
if [ "$METHOD_DONE" = 0 ]; then
  BANNED+=('130[-–]300' '2 degrees')
fi

hits=0
scan() {   # $1 label, rest patterns
  local label=$1; shift
  local p out
  for p in "$@"; do
    out=$(grep -n -i -E -- "$p" "${files[@]}" 2>/dev/null || true)
    if [ -n "$out" ]; then
      echo "$label  /$p/"
      echo "$out" | sed 's/^/    /'
      [ "$label" = "BANNED" ] && hits=$((hits + $(echo "$out" | wc -l)))
    fi
  done
}
echo "check_wording: ${#files[@]} files read"
scan BANNED "${BANNED[@]}"
scan REVIEW "${REVIEW[@]}"
if [ "$hits" -gt 0 ]; then echo "check_wording: $hits banned hit(s). Fix them or justify each one on DOB-109."; exit 1; fi
echo "check_wording: no banned phrase (REVIEW hits above, if any, need a human read)"
