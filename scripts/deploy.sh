#!/usr/bin/env bash
# 운영 서버(DEPLOY)에서 plotline 유저로 실행하는 배포 스크립트. 인자 없음. GitHub Actions deploy 잡이 SSH로 호출한다.
# 롤백: 이 스크립트에는 롤백 분기가 없다.
#   1) 서버 .env 의 WEB_IMAGE_TAG · API_IMAGE_TAG 를 되돌릴 버전의 sha-<7자> 로 지정한다.
#   2) 이 스크립트를 재실행한다(지정한 태그를 pull·기동). 복구 후 두 값을 비우면 다시 latest 를 따른다.
set -euo pipefail
umask 077

COMPOSE_FILE=docker-compose.prod.yml
WAIT_TIMEOUT_SECONDS=180
ENV_MISMATCH_EXIT_CODE=1

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

# 서버 checkout은 sparse 상태이며 원격 main 이 유일한 기준이다.
# 서버에서 생긴 추적 파일의 로컬 변경은 의도적으로 버린다(.env 등 미추적 파일은 reset --hard 대상이 아님).
git fetch --prune origin main
git reset --hard origin/main

# env 키 불일치는 경고만 하고 배포를 계속한다. 키 이름만 출력되며 값은 출력되지 않는다.
# 파일 없음(종료 코드 2) 등 그 밖의 실패는 배포를 중단한다.
env_check_status=0
sh scripts/env-check.sh || env_check_status=$?
if [ "$env_check_status" -eq "$ENV_MISMATCH_EXIT_CODE" ]; then
  echo "경고: .env 와 .env.example 의 키 불일치 — 배포는 계속" >&2
elif [ "$env_check_status" -ne 0 ]; then
  echo "env 점검 실패(종료 코드 $env_check_status) — 배포 중단" >&2
  exit "$env_check_status"
fi

# 전제: GHCR 패키지(plotline-web · plotline-api)는 public — 서버에서 로그인하지 않고 pull한다.
# private로 바꾸면 서버에서 docker login ghcr.io 가 먼저 필요하다.
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS"
docker compose -f "$COMPOSE_FILE" ps

# dangling 이미지만 정리한다(태그가 붙은 롤백용 이미지는 남는다).
docker image prune -f
