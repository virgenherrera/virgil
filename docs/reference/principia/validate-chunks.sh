#!/bin/bash
#
# validate-chunks.sh — integrity validator for the Principia RAG chunk
# decomposition (principia/sections/*.md + principia/manifest.yaml).
#
# Checks performed:
#   1. Watermark:        manifest source_commit == constitution.md HEAD
#   2. File existence:   every manifest `file:` path exists on disk
#   3. section_id:       no two chunks declare the same section_id
#   4. Reference targets: depends_on / referenced_by resolve to a section_id
#   5. Bidirectionality: A depends_on B  =>  B referenced_by includes A
#   6. Glossary:         glossary_index terms resolve to a valid chunk id
#
# Requires: bash, git, awk, sort, uniq. No other dependencies.
#
# Usage:
#   ./principia/validate-chunks.sh
#
# Exit status: 0 if all checks pass, 1 if any check fails.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.yaml"

PASS_N=0
FAIL_N=0
TOTAL=6

pass() { echo "[PASS] $1"; PASS_N=$((PASS_N + 1)); }
fail() { echo "[FAIL] $1"; FAIL_N=$((FAIL_N + 1)); }

contains() {
  local list="$1" target="$2" t
  for t in $list; do
    [ "$t" = "$target" ] && return 0
  done
  return 1
}

find_by_section() {
  local target="$1" m
  for ((m = 0; m < N; m++)); do
    [ "${SECTIONID[m]}" = "$target" ] && { echo "$m"; return 0; }
  done
  return 1
}

# --- Load manifest: chunk id/file pairs ------------------------------------
i=0
while read -r id file; do
  [ -z "$id" ] && continue
  ID[i]="$id"
  FILE[i]="$file"
  i=$((i + 1))
done < <(awk '
  /^chunks:/ { inb = 1; next }
  /^cross_cutting:/ { inb = 0 }
  inb && /^  - id:/ { id = $3 }
  inb && /^    file:/ { print id " " $2 }
' "$MANIFEST")
N=$i

# --- Load per-chunk frontmatter: section_id, depends_on, referenced_by -----
for ((n = 0; n < N; n++)); do
  f="$SCRIPT_DIR/${FILE[n]}"
  if [ -f "$f" ]; then
    SECTIONID[n]=$(awk -F'"' '/^section_id:/ {print $2; exit}' "$f")
    draw=$(awk -F'[][]' '/^depends_on:/ {print $2; exit}' "$f")
    rraw=$(awk -F'[][]' '/^referenced_by:/ {print $2; exit}' "$f")
    DEPENDS[n]=$(printf '%s' "${draw//\"/}" | awk -F',' '{
      for (k = 1; k <= NF; k++) { gsub(/^[ \t]+|[ \t]+$/, "", $k); if ($k != "") printf "%s ", $k }
    }')
    REFBY[n]=$(printf '%s' "${rraw//\"/}" | awk -F',' '{
      for (k = 1; k <= NF; k++) { gsub(/^[ \t]+|[ \t]+$/, "", $k); if ($k != "") printf "%s ", $k }
    }')
  else
    SECTIONID[n]=""
    DEPENDS[n]=""
    REFBY[n]=""
  fi
done

echo "== Principia chunk validation =="
echo

# 1. Watermark check ----------------------------------------------------
manifest_commit=$(awk -F': ' '/^source_commit:/ {print $2; exit}' "$MANIFEST" | tr -d ' \t\r\n')
overview_commit=$(git -C "$SCRIPT_DIR" log -1 --format=%H -- constitution.md)
case "$overview_commit" in
  "$manifest_commit"*)
    pass "watermark: manifest source_commit ($manifest_commit) matches constitution.md HEAD" ;;
  *)
    fail "watermark: manifest source_commit ($manifest_commit) != constitution.md HEAD ($overview_commit)"
    echo "  All $N chunks may be stale: ${ID[*]}" ;;
esac
echo

# 2. File existence check ----------------------------------------------
missing=0
for ((n = 0; n < N; n++)); do
  f="$SCRIPT_DIR/${FILE[n]}"
  [ -f "$f" ] || { echo "  MISSING: ${ID[n]} -> ${FILE[n]}"; missing=$((missing + 1)); }
done
if [ "$missing" -eq 0 ]; then
  pass "file existence: all $N manifest files present"
else
  fail "file existence: $missing file(s) missing"
fi
echo

# 3. section_id uniqueness ----------------------------------------------
dups=$(printf '%s\n' "${SECTIONID[@]}" | awk 'NF' | sort | uniq -d)
if [ -z "$dups" ]; then
  pass "section_id uniqueness: no duplicates"
else
  fail "section_id uniqueness: duplicate section_id(s) found"
  while read -r sid; do
    [ -z "$sid" ] && continue
    owners=""
    for ((n = 0; n < N; n++)); do
      [ "${SECTIONID[n]}" = "$sid" ] && owners="$owners ${ID[n]}"
    done
    echo "  DUPLICATE section_id '$sid':$owners"
  done <<< "$dups"
fi
echo

# 4/5. depends_on / referenced_by resolution + bidirectionality ---------
broken=0
asym=0
for ((n = 0; n < N; n++)); do
  [ -z "${SECTIONID[n]}" ] && continue
  for tok in ${DEPENDS[n]}; do
    m=$(find_by_section "$tok")
    if [ -z "$m" ]; then
      echo "  BROKEN depends_on: ${ID[n]} (${SECTIONID[n]}) -> '$tok' not found"
      broken=$((broken + 1))
    elif ! contains "${REFBY[m]}" "${SECTIONID[n]}"; then
      echo "  ASYMMETRIC: ${ID[n]} depends_on '$tok', but ${ID[m]}'s referenced_by lacks '${SECTIONID[n]}'"
      asym=$((asym + 1))
    fi
  done
  for tok in ${REFBY[n]}; do
    m=$(find_by_section "$tok")
    if [ -z "$m" ]; then
      echo "  BROKEN referenced_by: ${ID[n]} (${SECTIONID[n]}) -> '$tok' not found"
      broken=$((broken + 1))
    fi
  done
done
if [ "$broken" -eq 0 ]; then
  pass "depends_on/referenced_by targets: all resolve"
else
  fail "depends_on/referenced_by targets: $broken broken reference(s)"
fi
echo
if [ "$asym" -eq 0 ]; then
  pass "bidirectionality: depends_on/referenced_by are symmetric"
else
  fail "bidirectionality: $asym asymmetric reference(s)"
fi
echo

# 6. glossary_index consistency ------------------------------------------
broken_g=0
while IFS='|' read -r term gid; do
  [ -z "$term" ] && continue
  found=0
  for ((n = 0; n < N; n++)); do
    [ "${ID[n]}" = "$gid" ] && { found=1; break; }
  done
  if [ "$found" -eq 0 ]; then
    echo "  BROKEN glossary term '$term' -> '$gid' (no such chunk id)"
    broken_g=$((broken_g + 1))
  fi
done < <(awk '
  /^glossary_index:/ { ing = 1; next }
  ing && /^  [^ ]/ {
    idx = index($0, ": ")
    print substr($0, 3, idx - 3) "|" substr($0, idx + 2)
  }
' "$MANIFEST")
if [ "$broken_g" -eq 0 ]; then
  pass "glossary_index: all terms resolve to valid chunks"
else
  fail "glossary_index: $broken_g broken term(s)"
fi
echo

# --- Summary ----------------------------------------------------------
echo "== Summary: $PASS_N passed / $FAIL_N failed / $TOTAL total =="

[ "$FAIL_N" -eq 0 ] && exit 0
exit 1
