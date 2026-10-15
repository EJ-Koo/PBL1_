"""관리자 계정 생성 스크립트. 공개 API로는 관리자 가입을 받지 않으므로
로컬에서 이 스크립트를 직접 실행해 admins 테이블에 계정을 만든다.

사용법 (backend/ 디렉토리에서):
    python scripts/create_admin.py <username>
    python scripts/create_admin.py <username> --password <password>  # 비대화형

--password 없이 실행하면 getpass로 입력받는다. Windows 콘솔에서 stdin을
파이프로 넘기면 getpass가 막히므로, 비대화형으로 쓸 때는 --password를 쓴다.
"""

import argparse
import getpass
import sys

import bcrypt

from app.db import supabase


def main() -> None:
    parser = argparse.ArgumentParser(description="관리자 계정 생성")
    parser.add_argument("username")
    parser.add_argument(
        "--password",
        help="비대화형 실행용 비밀번호. 생략하면 getpass로 입력받는다.",
    )
    args = parser.parse_args()

    if args.password:
        password = args.password
    else:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("비밀번호가 일치하지 않습니다.", file=sys.stderr)
            raise SystemExit(1)

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    result = (
        supabase.table("admins")
        .insert({"username": args.username, "password_hash": password_hash})
        .execute()
    )
    print(f"관리자 계정 생성됨: {result.data[0]['id']} ({args.username})")


if __name__ == "__main__":
    main()
