#!/usr/bin/env bash
# 운영 서버(DEPLOY)에서 plotline 유저로 실행하는 배포 스크립트. 인자 없음. GitHub Actions deploy 잡이 SSH로 호출한다.
# 롤백(서버에서 plotline 유저로 직접 실행):
#   1) 서버 .env 의 WEB_IMAGE_TAG · API_IMAGE_TAG 를 되돌릴 버전의 sha-<7자> 로 지정한다(각 패키지에 그 태그가 실제로 있는지 먼저 확인).
#   2) SKIP_MIGRATION=1 bash scripts/deploy.sh 로 재실행한다. 옛 이미지는 새 revision 을 모르거나 alembic 이 없을 수 있어 마이그레이션을 건너뛴다.
#      D-19(추가형 변경만)에 따라 스키마는 되돌리지 않고 옛 코드를 그대로 돌린다.
#   3) 복구 후 두 태그 값을 비우면 다시 latest 를 따른다.
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

# D-19: 새 api 를 띄우기 전에 받은 api 이미지로 스키마를 먼저 올린다. 이미 최신이면 변경 없이 끝나므로 web 만 바뀐 배포에서도 실행한다.
# 실패하면 여기서 배포를 중단해 기존 컨테이너를 그대로 둔다. -T: SSH 비대화형 호출이라 TTY 를 잡지 않는다.
# SKIP_MIGRATION=1 이면 롤백 전용으로 이 단계를 건너뛴다(옛 이미지에 alembic 이 없거나 revision 을 모를 수 있음).
if [ "${SKIP_MIGRATION:-0}" = "1" ]; then
  echo "SKIP_MIGRATION=1 — 마이그레이션 건너뜀(롤백 전용)" >&2
else
  migration_status=0
  docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T api alembic upgrade head || migration_status=$?
  if [ "$migration_status" -ne 0 ]; then
    echo "마이그레이션 실패(종료 코드 $migration_status) — 배포 중단, 기존 컨테이너 유지" >&2
    exit "$migration_status"
  fi
fi

docker compose -f "$COMPOSE_FILE" up -d --no-build --wait --wait-timeout "$WAIT_TIMEOUT_SECONDS"
docker compose -f "$COMPOSE_FILE" ps

# dangling 이미지만 정리한다(태그가 붙은 롤백용 이미지는 남는다).
docker image prune -f
