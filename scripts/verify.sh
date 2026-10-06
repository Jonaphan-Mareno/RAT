#!/bin/bash
# RAT Verification Script - tests all fixtures against expected values
set -e

BASE="${BASE:-http://localhost:3001/api}"
PASS=0
FAIL=0
TOTAL=0

check() {
  TOTAL=$((TOTAL + 1))
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc (expected=$expected, got=$actual)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected=$expected, got=$actual)"
  fi
}

echo "=========================================="
echo "RAT Verification Suite"
echo "=========================================="

echo ""
echo "--- FIXTURE A (id=2): Hand-computable metrics ---"
# Get commits in order
COMMITS_A=$(curl -s "$BASE/repos/2/commits?limit=10" | python3 -c "
import json, sys
d = json.load(sys.stdin)
commits = sorted(d['commits'], key=lambda c: c['committer_date'])
for c in commits:
    print(c['hash'])
")
C1=$(echo "$COMMITS_A" | sed -n '1p')
C2=$(echo "$COMMITS_A" | sed -n '2p')
C3=$(echo "$COMMITS_A" | sed -n '3p')
echo "C1=$C1, C2=$C2, C3=$C3"

# C1: A.txt -> l+=2, l-=0
echo "Test: C1 file metrics for A.txt"
C1_DATA=$(curl -s "$BASE/repos/2/metrics/file?commit=$C1&path=A.txt")
C1_ADD=$(echo "$C1_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['added'])")
C1_REM=$(echo "$C1_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['removed'])")
C1_GRO=$(echo "$C1_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['growth'])")
C1_CHU=$(echo "$C1_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['churn'])")
check "C1 A.txt added" "2" "$C1_ADD"
check "C1 A.txt removed" "0" "$C1_REM"
check "C1 A.txt growth" "2" "$C1_GRO"
check "C1 A.txt churn" "2" "$C1_CHU"

# C2: A.txt -> l+=3, l-=1
echo "Test: C2 file metrics for A.txt"
C2_DATA=$(curl -s "$BASE/repos/2/metrics/file?commit=$C2&path=A.txt")
C2_ADD=$(echo "$C2_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['added'])")
C2_REM=$(echo "$C2_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['removed'])")
check "C2 A.txt added" "3" "$C2_ADD"
check "C2 A.txt removed" "1" "$C2_REM"

# C3: B.txt -> l+=1
echo "Test: C3 file metrics for B.txt"
C3_DATA=$(curl -s "$BASE/repos/2/metrics/file?commit=$C3&path=B.txt")
C3_ADD=$(echo "$C3_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['added'])")
check "C3 B.txt added" "1" "$C3_ADD"

# Commit set H={C1,C2}: A.txt -> l+=5, l-=1, delta=+4, churn=6, n=2
echo "Test: Commit set {C1,C2} for A.txt"
CS_DATA=$(curl -s "$BASE/repos/2/metrics/commit-set?commitHashes=$C1,$C2&path=A.txt")
CS_ADD=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['added'])")
CS_REM=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['removed'])")
CS_GRO=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['growth'])")
CS_CHU=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['churn'])")
CS_MOD=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['modifications'])")
CS_ETA=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['modificationFreq'])")
CS_RHO=$(echo "$CS_DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['files'] if x['path']=='A.txt'][0]; print(f['churnRate'])")
check "H={C1,C2} A.txt added" "5" "$CS_ADD"
check "H={C1,C2} A.txt removed" "1" "$CS_REM"
check "H={C1,C2} A.txt growth" "4" "$CS_GRO"
check "H={C1,C2} A.txt churn" "6" "$CS_CHU"
check "H={C1,C2} A.txt modifications" "2" "$CS_MOD"
check "H={C1,C2} A.txt eta" "1" "$CS_ETA"
check "H={C1,C2} A.txt rho" "3" "$CS_RHO"

echo ""
echo "--- FIXTURE E (id=6): Time window filters ---"
# Test fromDate filter
echo "Test: H_t(2024-06-15) - should get E2 and E3"
TW_DATA=$(curl -s "$BASE/repos/6/metrics/repository?fromDate=2024-06-15T00:00:00Z")
TW_HSIZE=$(echo "$TW_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['H_size'])")
check "H_t(June 15) |H|" "2" "$TW_HSIZE"

# Test fromDate + toDate
echo "Test: H_i,j(2024-06-01, 2024-07-01) - should get E1, E2"
TW2_DATA=$(curl -s "$BASE/repos/6/metrics/repository?fromDate=2024-06-01T00:00:00Z&toDate=2024-07-01T00:00:00Z")
TW2_HSIZE=$(echo "$TW2_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['H_size'])")
check "H_{June 1, July 1} |H|" "2" "$TW2_HSIZE"

# Empty window
echo "Test: empty window"
TW3_DATA=$(curl -s "$BASE/repos/6/metrics/repository?fromDate=2024-06-15T12:00:00Z&toDate=2024-06-15T12:00:00Z")
TW3_HSIZE=$(echo "$TW3_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['H_size'])")
check "Empty window |H|" "0" "$TW3_HSIZE"

echo ""
echo "--- FIXTURE C (id=4): Rename/delete/binary/merge ---"
echo "Test: merge commit excluded (6 non-merge commits)"
FC_DATA=$(curl -s "$BASE/repos/4/metrics/repository")
FC_HSIZE=$(echo "$FC_DATA" | python3 -c "import json,sys; print(json.load(sys.stdin)['H_size'])")
check "Fixture C |H| (no merges)" "6" "$FC_HSIZE"

echo ""
echo "--- FIXTURE D (id=5): Author merging ---"
echo "Test: author count"
AD_DATA=$(curl -s "$BASE/repos/5/authors")
AD_COUNT=$(echo "$AD_DATA" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['authors']))")
echo "  Authors before merge: $AD_COUNT"

echo ""
echo "=========================================="
echo "RESULTS: $PASS passed, $FAIL failed out of $TOTAL tests"
echo "=========================================="
