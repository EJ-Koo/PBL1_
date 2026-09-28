from supabase import create_client, Client

from app.config import settings

supabase: Client = create_client(settings.supabase_url, settings.supabase_key)


def new_auth_client() -> Client:
    """새 클라이언트 인스턴스 반환. 로그인/회원가입 시 동시 요청 간 세션 상태가
    섞이지 않도록 공유 `supabase` 클라이언트 대신 이 함수로 매번 새로 생성해 사용한다."""
    return create_client(settings.supabase_url, settings.supabase_key)
