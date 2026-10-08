"""관리자 비밀번호 argon2id 해시 생성 도구.

사용: docker compose exec backend uv run python -m app.admin_auth.hash_password
비밀번호는 셸 기록·프로세스 목록에 남지 않도록 인자로 받지 않고 getpass 로만 입력받는다.
출력된 해시를 .env 의 ADMIN_PASSWORD_HASH 에 넣는다.
"""

import sys
from getpass import getpass

from argon2 import PasswordHasher

EXIT_OK = 0
EXIT_FAILURE = 1


def main() -> int:
    password = getpass("관리자 비밀번호: ")
    confirmation = getpass("비밀번호 확인: ")
    if not password:
        print("비밀번호가 비어 있습니다.", file=sys.stderr)
        return EXIT_FAILURE
    if password != confirmation:
        print("두 입력이 일치하지 않습니다.", file=sys.stderr)
        return EXIT_FAILURE
    # 운영 해시는 argon2-cffi 기본 파라미터(argon2id)를 쓴다.
    print(PasswordHasher().hash(password))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
