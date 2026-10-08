#!/usr/bin/env sh
# .env 와 .env.example 의 키 집합을 비교한다. 값은 출력하지 않는다.
# 사용: scripts/env-check.sh [ENV_FILE] [EXAMPLE_FILE]
# 종료 코드: 0 = 일치, 1 = 불일치, 2 = 파일 없음
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE=${1:-"$ROOT_DIR/.env"}
EXAMPLE_FILE=${2:-"$ROOT_DIR/.env.example"}

for f in "$ENV_FILE" "$EXAMPLE_FILE"; do
  if [ ! -f "$f" ]; then
    echo "파일 없음: $f" >&2
    exit 2
  fi
done

# 주석·빈 줄을 제외하고 KEY= 형태의 키 이름만 추출
keys() {
  sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)[[:space:]]*=.*/\2/p' "$1" | sort -u
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
keys "$ENV_FILE" > "$TMP_DIR/env"
keys "$EXAMPLE_FILE" > "$TMP_DIR/example"

ONLY_EXAMPLE=$(comm -13 "$TMP_DIR/env" "$TMP_DIR/example")
ONLY_ENV=$(comm -23 "$TMP_DIR/env" "$TMP_DIR/example")

status=0
if [ -n "$ONLY_EXAMPLE" ]; then
  echo "example에만 있음:"
  echo "$ONLY_EXAMPLE" | sed 's/^/  - /'
  status=1
fi
if [ -n "$ONLY_ENV" ]; then
  echo "env에만 있음:"
  echo "$ONLY_ENV" | sed 's/^/  - /'
  status=1
fi
if [ "$status" -eq 0 ]; then
  echo "키 집합 일치 (불일치 0)"
fi
exit "$status"
