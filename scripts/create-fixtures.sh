#!/bin/bash
set -e
FIXTURES_DIR="/home/vmuser/Desktop/RAT/test-fixtures"
rm -rf "$FIXTURES_DIR"
mkdir -p "$FIXTURES_DIR"

echo "=== Fixture A: hand-computable ==="
REPO_A="$FIXTURES_DIR/fixture-a"
mkdir -p "$REPO_A" && cd "$REPO_A"
git init && git config user.name "TestUser" && git config user.email "test@test.com"
printf "line1\nline2\n" > A.txt && git add A.txt
GIT_COMMITTER_DATE="2024-01-01T10:00:00+00:00" git commit -m "C1: add A.txt with 2 lines" --date="2024-01-01T10:00:00+00:00"

printf "line1\nnewline1\nnewline2\nnewline3\n" > A.txt && git add A.txt
GIT_COMMITTER_DATE="2024-01-02T10:00:00+00:00" git commit -m "C2: modify A.txt" --date="2024-01-02T10:00:00+00:00"

printf "hello\n" > B.txt && git add B.txt
GIT_COMMITTER_DATE="2024-01-03T10:00:00+00:00" git commit -m "C3: add B.txt" --date="2024-01-03T10:00:00+00:00"
echo "Fixture A done: $(git rev-list --count HEAD) commits"

echo "=== Fixture B: directory semantics ==="
REPO_B="$FIXTURES_DIR/fixture-b"
mkdir -p "$REPO_B" && cd "$REPO_B"
git init && git config user.name "TestUser" && git config user.email "test@test.com"
mkdir -p foo/baz
printf "line1\nline2\n" > foo/bar.txt
printf "line1\nline2\nline3\n" > foo/baz/beef.py
printf "line1\n" > foo/baz/dead.py
git add . && GIT_COMMITTER_DATE="2024-01-01T10:00:00+00:00" git commit -m "B1: init" --date="2024-01-01T10:00:00+00:00"
printf "line1\nline2\nline3\nline4\nline5\n" > foo/baz/beef.py && git add .
GIT_COMMITTER_DATE="2024-01-02T10:00:00+00:00" git commit -m "B2: edit beef.py" --date="2024-01-02T10:00:00+00:00"
git rm foo/baz/dead.py
GIT_COMMITTER_DATE="2024-01-03T10:00:00+00:00" git commit -m "B3: delete dead.py" --date="2024-01-03T10:00:00+00:00"
echo "Fixture B done: $(git rev-list --count HEAD) commits"

echo "=== Fixture C: rename/delete/binary/merge ==="
REPO_C="$FIXTURES_DIR/fixture-c"
mkdir -p "$REPO_C" && cd "$REPO_C"
git init && git config user.name "TestUser" && git config user.email "test@test.com"
printf "line1\nline2\n" > A.txt && printf "line1\n" > B.txt && git add .
GIT_COMMITTER_DATE="2024-01-01T10:00:00+00:00" git commit -m "C-init" --date="2024-01-01T10:00:00+00:00"
git mv B.txt B2.txt
GIT_COMMITTER_DATE="2024-01-02T10:00:00+00:00" git commit -m "C4: rename B.txt" --date="2024-01-02T10:00:00+00:00"
git mv A.txt A2.txt && printf "line1\nline2\nline3\nnewline\n" > A2.txt && git add A2.txt
GIT_COMMITTER_DATE="2024-01-03T10:00:00+00:00" git commit -m "C5: rename+edit A" --date="2024-01-03T10:00:00+00:00"
git rm B2.txt
GIT_COMMITTER_DATE="2024-01-04T10:00:00+00:00" git commit -m "C6: delete B2.txt" --date="2024-01-04T10:00:00+00:00"
printf '\x89PNG\r\n\x1a\n' > image.png && git add image.png
GIT_COMMITTER_DATE="2024-01-05T10:00:00+00:00" git commit -m "C7: add binary" --date="2024-01-05T10:00:00+00:00"
git checkout -b feature
printf "feature\n" > feature.txt && git add feature.txt
GIT_COMMITTER_DATE="2024-01-06T10:00:00+00:00" git commit -m "C8-feature" --date="2024-01-06T10:00:00+00:00"
git checkout master && git merge --no-ff feature -m "C8-merge"
echo "Fixture C done: total=$(git rev-list --count HEAD) non-merge=$(git rev-list --no-merges --count HEAD)"

echo "=== Fixture D: author merging ==="
REPO_D="$FIXTURES_DIR/fixture-d"
mkdir -p "$REPO_D" && cd "$REPO_D"
git init && git config user.name "Jon Doe" && git config user.email "jd@work.com"
printf "work line\n" > file.txt && git add file.txt
GIT_COMMITTER_DATE="2024-01-01T10:00:00+00:00" git commit -m "D1" --date="2024-01-01T10:00:00+00:00"
git config user.name "Jonathan Doe" && git config user.email "jd@personal.com"
printf "work line\npersonal line\n" > file.txt && git add file.txt
GIT_COMMITTER_DATE="2024-01-02T10:00:00+00:00" git commit -m "D2" --date="2024-01-02T10:00:00+00:00"
printf "Jon Doe <jd@work.com> Jonathan Doe <jd@personal.com>\n" > .mailmap
git add .mailmap && git config user.name "Jon Doe" && git config user.email "jd@work.com"
GIT_COMMITTER_DATE="2024-01-03T10:00:00+00:00" git commit -m "D3: add mailmap" --date="2024-01-03T10:00:00+00:00"
echo "Fixture D done"

echo "=== Fixture E: time windows ==="
REPO_E="$FIXTURES_DIR/fixture-e"
mkdir -p "$REPO_E" && cd "$REPO_E"
git init && git config user.name "TestUser" && git config user.email "test@test.com"
printf "t1\n" > file.txt && git add file.txt
GIT_COMMITTER_DATE="2024-06-01T12:00:00+00:00" git commit -m "E1" --date="2024-06-01T12:00:00+00:00"
printf "t1\nt2\n" > file.txt && git add file.txt
GIT_COMMITTER_DATE="2024-06-15T12:00:00+00:00" git commit -m "E2" --date="2024-06-15T12:00:00+00:00"
printf "t1\nt2\nt3\n" > file.txt && git add file.txt
GIT_COMMITTER_DATE="2024-07-01T12:00:00+00:00" git commit -m "E3" --date="2024-07-01T12:00:00+00:00"
echo "Fixture E done"

echo "=== All fixtures created ==="
ls "$FIXTURES_DIR"
